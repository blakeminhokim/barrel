/**
 * Orchestrator - Coordinates agent swarm for trading consensus
 */

import { BaseAgent, MarketSignal, TradeProposal, ConsensusResult, TradeDirection } from './types.js';
import { BarrelConfig } from './config.js';
import { getPythClient, PriceUpdate } from '../data/pyth.js';
import { getSentimentClient, SentimentSignal } from '../data/sentiment.js';
import { getNadFunClient, NadFunLaunch } from '../data/nadfun.js';
import { ContractClient, ProposalStatus } from '../execution/contracts.js';

export interface OrchestratorState {
  isRunning: boolean;
  lastTick: number;
  activeProposals: Map<string, TradeProposal>;
  recentSignals: MarketSignal[];
  stats: {
    tickCount: number;
    proposalsCreated: number;
    consensusReached: number;
    totalStaked: bigint;
  };
}

export class Orchestrator {
  private agents: BaseAgent[];
  private config: BarrelConfig;
  private state: OrchestratorState;
  
  // Data clients
  private pythClient;
  private sentimentClient;
  private nadFunClient;
  
  // Contract clients per agent
  private contractClients: Map<string, ContractClient> = new Map();

  constructor(agents: BaseAgent[], config: BarrelConfig) {
    this.agents = agents;
    this.config = config;
    
    this.state = {
      isRunning: false,
      lastTick: 0,
      activeProposals: new Map(),
      recentSignals: [],
      stats: {
        tickCount: 0,
        proposalsCreated: 0,
        consensusReached: 0,
        totalStaked: BigInt(0),
      },
    };

    // Initialize data clients
    this.pythClient = getPythClient(config.pythEndpoint);
    this.sentimentClient = getSentimentClient(config.xApiKey);
    this.nadFunClient = getNadFunClient(config.rpcUrl, config.nadFunAddress);

    // Initialize contract clients for each agent
    this.initializeContractClients();

    console.log(`🐒 Orchestrator initialized with ${agents.length} agents`);
  }

  private initializeContractClients(): void {
    const keys = this.config.agentPrivateKeys;
    
    if (keys.mo) {
      this.contractClients.set('Mo', new ContractClient(
        this.config.rpcUrl, keys.mo, this.config.consensusAddress, this.config.tokenAddress
      ));
    }
    if (keys.vox) {
      this.contractClients.set('Vox', new ContractClient(
        this.config.rpcUrl, keys.vox, this.config.consensusAddress, this.config.tokenAddress
      ));
    }
    if (keys.degen) {
      this.contractClients.set('Degen', new ContractClient(
        this.config.rpcUrl, keys.degen, this.config.consensusAddress, this.config.tokenAddress
      ));
    }
  }

  async start(): Promise<void> {
    this.state.isRunning = true;
    console.log('🚀 Starting Barrel consensus loop...');
    console.log(`   Poll interval: ${this.config.pollIntervalMs}ms`);

    // Start watching Nad.fun for new launches
    this.nadFunClient?.watchLaunches((launch) => {
      console.log(`🎰 New Nad.fun launch detected: ${launch.symbol}`);
      this.handleNewLaunch(launch);
    });

    while (this.state.isRunning) {
      try {
        await this.tick();
        this.state.lastTick = Date.now();
        this.state.stats.tickCount++;
      } catch (error) {
        console.error('❌ Error in consensus loop:', error);
      }
      await this.sleep(this.config.pollIntervalMs);
    }
  }

  stop(): void {
    this.state.isRunning = false;
    console.log('🛑 Stopping consensus loop...');
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }

  private async tick(): Promise<void> {
    // 1. Fetch market signals from all sources
    const signals = await this.fetchMarketSignals();
    this.state.recentSignals = signals;
    
    if (signals.length === 0) {
      return; // Nothing to do
    }

    // 2. Let each agent analyze and potentially propose
    const proposals: TradeProposal[] = [];
    
    for (const agent of this.agents) {
      // Check if agent is on cooldown
      const client = this.contractClients.get(agent.name);
      if (client && await client.isOnCooldown()) {
        console.log(`⏳ ${agent.name} is on cooldown, skipping...`);
        continue;
      }

      for (const signal of signals) {
        const proposal = await agent.analyze(signal);
        if (proposal) {
          proposals.push(proposal);
          console.log(`📝 ${agent.name} proposed: ${proposal.direction} on ${signal.token}`);
        }
      }
    }

    // 3. For each proposal, gather stake decisions and submit to contract
    for (const proposal of proposals) {
      await this.processProposal(proposal);
    }

    // 4. Check and update active proposals
    await this.updateActiveProposals();
  }

  private async processProposal(proposal: TradeProposal): Promise<void> {
    console.log(`\n🗳️ Processing proposal: ${proposal.id}`);
    console.log(`   Token: ${proposal.token}`);
    console.log(`   Direction: ${proposal.direction}`);
    console.log(`   Conviction: ${proposal.conviction}%`);
    
    // Submit proposal to contract (if we have the creator's client)
    const creatorClient = this.contractClients.get(proposal.agent);
    if (creatorClient) {
      try {
        const stakeAmount = BigInt(Math.floor(proposal.conviction * 100)) * BigInt(1e18);
        const result = await creatorClient.createProposal(
          proposal.token,
          this.mapDirection(proposal.direction),
          stakeAmount
        );
        proposal.id = result.proposalId;
        this.state.stats.proposalsCreated++;
        console.log(`   ✅ Proposal created on-chain: ${result.txHash}`);
      } catch (error) {
        console.error(`   ❌ Failed to create proposal:`, error);
        return;
      }
    }

    // Gather stake decisions from other agents
    for (const agent of this.agents) {
      if (agent.name === proposal.agent) continue; // Skip proposer

      const decision = await agent.evaluateProposal(proposal);
      console.log(`   ${agent.name}: ${decision.isFor ? '✅ FOR' : '❌ AGAINST'} (conviction: ${proposal.conviction})`);

      // Submit stake to contract
      const client = this.contractClients.get(agent.name);
      if (client && decision.amount > 0) {
        try {
          await client.stake(proposal.id, decision.amount, decision.isFor);
          this.state.stats.totalStaked += decision.amount;
        } catch (error) {
          console.error(`   ❌ ${agent.name} failed to stake:`, error);
        }
      }
    }

    // Track proposal
    this.state.activeProposals.set(proposal.id, proposal);
  }

  private async updateActiveProposals(): Promise<void> {
    for (const [id, proposal] of this.state.activeProposals) {
      const client = this.contractClients.values().next().value;
      if (!client) continue;

      const onChainProposal = await client.getProposal(id);
      if (!onChainProposal) continue;

      if (onChainProposal.status !== ProposalStatus.Pending) {
        // Proposal finalized
        const result: ConsensusResult = {
          proposalId: id,
          direction: proposal.direction as any,
          totalStakeFor: onChainProposal.totalStakeFor,
          totalStakeAgainst: onChainProposal.totalStakeAgainst,
          consensusReached: onChainProposal.status === ProposalStatus.Executed,
          executedAt: Date.now(),
        };

        // Notify agents
        for (const agent of this.agents) {
          await agent.onConsensusResult(result);
        }

        // Claim rewards for winning agents
        await this.claimRewardsForProposal(id, onChainProposal.status);

        if (result.consensusReached) {
          this.state.stats.consensusReached++;
        }

        this.state.activeProposals.delete(id);
        console.log(`\n🏁 Proposal ${id} finalized: ${ProposalStatus[onChainProposal.status]}`);
      }
    }
  }

  private async claimRewardsForProposal(proposalId: string, status: ProposalStatus): Promise<void> {
    for (const [name, client] of this.contractClients) {
      try {
        await client.claimRewards(proposalId);
        console.log(`   💰 ${name} claimed rewards`);
      } catch {
        // May fail if not a participant or already claimed
      }
    }
  }

  private async fetchMarketSignals(): Promise<MarketSignal[]> {
    const signals: MarketSignal[] = [];

    // Fetch price data from Pyth
    try {
      const symbols = ['ETH/USD', 'BTC/USD', 'SOL/USD'];
      for (const symbol of symbols) {
        const update = await this.pythClient.getPriceUpdate(symbol);
        if (update && Math.abs(update.priceChange24h) > 5) { // Only signal on significant moves
          signals.push({
            token: symbol.split('/')[0],
            price: update.price,
            priceChange24h: update.priceChange24h,
            volume24h: 0, // Pyth doesn't provide volume
            timestamp: update.timestamp,
            metadata: { source: 'pyth', confidence: update.confidence },
          });
        }
      }
    } catch (error) {
      console.error('Error fetching Pyth data:', error);
    }

    return signals;
  }

  private async handleNewLaunch(launch: NadFunLaunch): Promise<void> {
    // Create a signal for the Degen agent
    const signal: MarketSignal = {
      token: launch.tokenAddress,
      price: 0,
      priceChange24h: 0,
      volume24h: 0,
      timestamp: launch.launchedAt,
      metadata: {
        source: 'nadfun',
        isNadFunLaunch: true,
        bondingCurveProgress: launch.bondingCurveProgress,
        symbol: launch.symbol,
        name: launch.name,
      },
    };

    // Trigger analysis from Degen agent
    const degen = this.agents.find(a => a.name === 'Degen');
    if (degen) {
      const proposal = await degen.analyze(signal);
      if (proposal) {
        await this.processProposal(proposal);
      }
    }
  }

  private mapDirection(dir: TradeDirection): number {
    switch (dir) {
      case TradeDirection.Long: return 0;
      case TradeDirection.Short: return 1;
      case TradeDirection.Hold: return 2;
      default: return 2;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
