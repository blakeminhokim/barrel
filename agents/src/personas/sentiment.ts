/**
 * Vox - Sentiment Agent
 * 
 * Reactive agent that tracks social signals and whale movements.
 * Medium risk tolerance, news-driven, whale-watcher.
 */

import { 
  BaseAgent, 
  AgentConfig, 
  MarketSignal, 
  TradeProposal, 
  StakeDecision,
  ConsensusResult,
  TradeDirection 
} from '../core/types.js';

export class SentimentAgent extends BaseAgent {
  name = 'Vox';
  
  config: AgentConfig = {
    name: 'Vox',
    personality: 'Social sentiment tracker. Watches CT, tracks whales, reacts to news.',
    riskTolerance: 'medium',
    walletAddress: '', // Set from env
  };

  async analyze(signal: MarketSignal): Promise<TradeProposal | null> {
    // Vox would integrate with social APIs
    // For now, use volume as proxy for "buzz"
    const { volume24h, priceChange24h, token } = signal;
    
    // High volume spike = something's happening
    if (volume24h > 2_000_000) {
      const direction = priceChange24h > 0 ? TradeDirection.Long : TradeDirection.Short;
      return {
        id: `vox-${Date.now()}`,
        token,
        direction,
        conviction: 65,
        reasoning: `Volume spike detected! ${volume24h.toLocaleString()} in 24h. CT is probably talking about this.`,
        agent: this.name,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  async evaluateProposal(proposal: TradeProposal): Promise<StakeDecision> {
    // Vox tries to gauge if the "crowd" would agree
    // Acts as a tiebreaker between Mo and Val
    
    const isFromMo = proposal.agent === 'Mo';
    const isFromVal = proposal.agent === 'Val';
    
    // Vox leans toward whoever has stronger narrative
    let isFor: boolean;
    let reasoning: string;

    if (isFromMo && proposal.conviction > 50) {
      isFor = true;
      reasoning = "Momentum plays well on CT. I'm in.";
    } else if (isFromVal && proposal.direction === TradeDirection.Hold) {
      isFor = true;
      reasoning = "Sometimes the best trade is no trade. Smart.";
    } else {
      // Default: follow the higher conviction
      isFor = proposal.conviction > 60;
      reasoning = isFor 
        ? "The signal looks strong enough. Let's see what happens."
        : "Not enough conviction here. Passing.";
    }

    const stakeAmount = BigInt(Math.floor(proposal.conviction * 50));

    return {
      proposalId: proposal.id,
      amount: stakeAmount,
      isFor,
      reasoning,
    };
  }

  async onConsensusResult(result: ConsensusResult): Promise<void> {
    if (result.consensusReached) {
      console.log(`📡 Vox: Posting the trade to CT... engagement incoming.`);
    } else {
      console.log(`📡 Vox: No consensus. The barrel is divided.`);
    }
  }
}
