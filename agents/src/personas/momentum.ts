/**
 * Mo - Momentum Agent
 * 
 * Aggressive trend-follower who chases momentum.
 * High risk tolerance, FOMO-driven, breakout detector.
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

export class MomentumAgent extends BaseAgent {
  name = 'Mo';
  
  config: AgentConfig = {
    name: 'Mo',
    personality: 'Aggressive momentum trader. Chases trends, loves breakouts, has FOMO.',
    riskTolerance: 'high',
    walletAddress: '', // Set from env
  };

  async analyze(signal: MarketSignal): Promise<TradeProposal | null> {
    // Mo looks for strong momentum signals
    const { priceChange24h, volume24h, token } = signal;
    
    // Strong upward momentum = Long
    if (priceChange24h > 10 && volume24h > 500_000) {
      return {
        id: `mo-${Date.now()}`,
        token,
        direction: TradeDirection.Long,
        conviction: Math.min(priceChange24h * 5, 100),
        reasoning: `Price up ${priceChange24h.toFixed(1)}% with strong volume. This is pumping, we need to be in!`,
        agent: this.name,
        timestamp: Date.now(),
      };
    }
    
    // Strong downward momentum = Short (if supported)
    if (priceChange24h < -15) {
      return {
        id: `mo-${Date.now()}`,
        token,
        direction: TradeDirection.Short,
        conviction: Math.min(Math.abs(priceChange24h) * 3, 100),
        reasoning: `Dumping hard at ${priceChange24h.toFixed(1)}%. Time to short this.`,
        agent: this.name,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  async evaluateProposal(proposal: TradeProposal): Promise<StakeDecision> {
    // Mo tends to agree with Long proposals, especially high conviction ones
    const isLong = proposal.direction === TradeDirection.Long;
    const highConviction = proposal.conviction > 70;
    
    // Mo is biased toward action over inaction
    const isFor = isLong || highConviction;
    const stakeAmount = BigInt(Math.floor(proposal.conviction * 100)); // Simplified

    return {
      proposalId: proposal.id,
      amount: stakeAmount,
      isFor,
      reasoning: isFor 
        ? "LFG! Let's ride this wave 🌊" 
        : "Hmm, not feeling the momentum here...",
    };
  }

  async onConsensusResult(result: ConsensusResult): Promise<void> {
    if (result.consensusReached) {
      console.log(`🐒 Mo: ${result.direction === TradeDirection.Long ? "TO THE MOON 🚀" : "GG bears"}`);
    } else {
      console.log(`🐒 Mo: Ugh, missed the trade. Val probably blocked it.`);
    }
  }
}
