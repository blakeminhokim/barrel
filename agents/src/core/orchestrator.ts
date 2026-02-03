/**
 * Orchestrator - Coordinates agent swarm for trading consensus
 */

import { BaseAgent, MarketSignal, TradeProposal, ConsensusResult } from './types.js';

export class Orchestrator {
  private agents: BaseAgent[];
  private isRunning = false;
  private pollInterval = 5000; // 5 seconds

  constructor(agents: BaseAgent[]) {
    this.agents = agents;
    console.log(`🐒 Orchestrator initialized with ${agents.length} agents`);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('🚀 Starting consensus loop...');

    while (this.isRunning) {
      try {
        await this.tick();
      } catch (error) {
        console.error('❌ Error in consensus loop:', error);
      }
      await this.sleep(this.pollInterval);
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log('🛑 Stopping consensus loop...');
  }

  private async tick(): Promise<void> {
    // 1. Fetch market signals
    const signals = await this.fetchMarketSignals();
    
    // 2. Let each agent analyze and potentially propose
    const proposals: TradeProposal[] = [];
    for (const agent of this.agents) {
      for (const signal of signals) {
        const proposal = await agent.analyze(signal);
        if (proposal) {
          proposals.push(proposal);
          console.log(`📝 ${agent.name} proposed: ${proposal.direction} on ${proposal.token}`);
        }
      }
    }

    // 3. For each proposal, gather stake decisions
    for (const proposal of proposals) {
      console.log(`\n🗳️ Voting on proposal: ${proposal.id}`);
      
      for (const agent of this.agents) {
        const decision = await agent.evaluateProposal(proposal);
        console.log(`  ${agent.name}: ${decision.isFor ? '✅ FOR' : '❌ AGAINST'} (${decision.amount} stake)`);
        // TODO: Submit stake to contract
      }

      // TODO: Check consensus and execute if reached
    }
  }

  private async fetchMarketSignals(): Promise<MarketSignal[]> {
    // TODO: Implement real market data fetching
    // For now, return mock data
    return [
      {
        token: '0x...', // Example token
        price: 1.05,
        priceChange24h: 5.2,
        volume24h: 1_000_000,
        timestamp: Date.now(),
      },
    ];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
