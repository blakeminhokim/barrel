/**
 * Val - Value Agent
 * 
 * Patient contrarian who looks for undervalued opportunities.
 * Low risk tolerance, fundamentals-focused, hates FOMO.
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

export class ValueAgent extends BaseAgent {
  name = 'Val';
  
  config: AgentConfig = {
    name: 'Val',
    personality: 'Patient value investor. Contrarian, fundamentals-focused, skeptical of hype.',
    riskTolerance: 'low',
    walletAddress: '', // Set from env
  };

  async analyze(signal: MarketSignal): Promise<TradeProposal | null> {
    // Val looks for oversold conditions and value opportunities
    const { priceChange24h, token } = signal;
    
    // Significant drop might be value opportunity
    if (priceChange24h < -20) {
      return {
        id: `val-${Date.now()}`,
        token,
        direction: TradeDirection.Long,
        conviction: Math.min(Math.abs(priceChange24h) * 2, 80), // Val never goes above 80
        reasoning: `Down ${Math.abs(priceChange24h).toFixed(1)}%. If fundamentals are solid, this is a buying opportunity.`,
        agent: this.name,
        timestamp: Date.now(),
      };
    }
    
    // Overheated = stay away
    if (priceChange24h > 30) {
      return {
        id: `val-${Date.now()}`,
        token,
        direction: TradeDirection.Hold,
        conviction: 60,
        reasoning: `Up ${priceChange24h.toFixed(1)}%? This is overheated. Be fearful when others are greedy.`,
        agent: this.name,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  async evaluateProposal(proposal: TradeProposal): Promise<StakeDecision> {
    // Val is skeptical of high-conviction momentum plays
    const isFromMo = proposal.agent === 'Mo';
    const isHighConviction = proposal.conviction > 80;
    const isLong = proposal.direction === TradeDirection.Long;
    
    // Val opposes FOMO-driven proposals
    if (isFromMo && isHighConviction && isLong) {
      return {
        proposalId: proposal.id,
        amount: BigInt(5000), // Stake against
        isFor: false,
        reasoning: "Classic FOMO. Mo needs to calm down. I'm voting against.",
      };
    }

    // Val cautiously supports value plays
    const isFor = proposal.conviction < 70 || proposal.direction === TradeDirection.Hold;
    const stakeAmount = BigInt(isFor ? 3000 : 2000);

    return {
      proposalId: proposal.id,
      amount: stakeAmount,
      isFor,
      reasoning: isFor 
        ? "Measured approach. I can support this." 
        : "Too aggressive. Let's wait for better entry.",
    };
  }

  async onConsensusResult(result: ConsensusResult): Promise<void> {
    if (result.consensusReached && result.direction === TradeDirection.Long) {
      console.log(`🦉 Val: Fine, but I'm keeping my stop-loss tight.`);
    } else if (!result.consensusReached) {
      console.log(`🦉 Val: Patience is a virtue. We'll find a better opportunity.`);
    }
  }
}
