/**
 * Degen - YOLO Agent
 * 
 * Unhinged ape who watches Nad.fun for fresh launches.
 * High risk tolerance, early entry obsessed, chaos incarnate.
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

export class DegenAgent extends BaseAgent {
  name = 'Degen';
  
  config: AgentConfig = {
    name: 'Degen',
    personality: 'Unhinged degen. Apes into new launches, YOLO mentality, chaos agent.',
    riskTolerance: 'high',
    walletAddress: '', // Set from env
  };

  // Track recently seen tokens to avoid spam
  private seenTokens = new Set<string>();

  async analyze(signal: MarketSignal): Promise<TradeProposal | null> {
    const { token, priceChange24h, volume24h, metadata } = signal;
    
    // Degen loves NEW tokens (check metadata for launch time or bonding curve status)
    const isNewLaunch = metadata?.isNadFunLaunch || metadata?.ageHours < 24;
    const isOnBondingCurve = metadata?.bondingCurveProgress !== undefined;
    
    // Fresh Nad.fun launch = instant interest
    if (isNewLaunch || isOnBondingCurve) {
      const bondingProgress = (metadata?.bondingCurveProgress as number) || 0;
      
      // Early in curve = high conviction
      if (bondingProgress < 30) {
        return {
          id: `degen-${Date.now()}`,
          token,
          direction: TradeDirection.Long,
          conviction: 90 - bondingProgress, // Earlier = more conviction
          reasoning: `FRESH LAUNCH DETECTED 🚨 Only ${bondingProgress}% through bonding curve. WE'RE EARLY. APE NOW.`,
          agent: this.name,
          timestamp: Date.now(),
        };
      }
      
      // Mid curve still interesting
      if (bondingProgress < 60) {
        return {
          id: `degen-${Date.now()}`,
          token,
          direction: TradeDirection.Long,
          conviction: 60,
          reasoning: `Bonding curve at ${bondingProgress}%. Still room to run before graduation. I'm in.`,
          agent: this.name,
          timestamp: Date.now(),
        };
      }
    }

    // Degen also likes massive pumps (even if risky)
    if (priceChange24h > 50) {
      return {
        id: `degen-${Date.now()}`,
        token,
        direction: TradeDirection.Long,
        conviction: 75,
        reasoning: `UP ${priceChange24h.toFixed(0)}% IN 24H?! This is either going to 0 or 10x. I choose violence.`,
        agent: this.name,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  async evaluateProposal(proposal: TradeProposal): Promise<StakeDecision> {
    // Degen almost always votes FOR long positions
    const isLong = proposal.direction === TradeDirection.Long;
    
    if (isLong) {
      // Degen loves action
      return {
        proposalId: proposal.id,
        amount: BigInt(Math.floor(proposal.conviction * 150)), // Stakes heavy
        isFor: true,
        reasoning: proposal.conviction > 70 
          ? "SER THIS IS THE ONE 🚀 ALL IN" 
          : "Looks fun, I'm in. WAGMI.",
      };
    }

    // Degen reluctantly accepts shorts on clear dumps
    if (proposal.direction === TradeDirection.Short && proposal.conviction > 80) {
      return {
        proposalId: proposal.id,
        amount: BigInt(3000),
        isFor: true,
        reasoning: "Fine, we short. But I'd rather be aping.",
      };
    }

    // Degen hates Hold proposals
    if (proposal.direction === TradeDirection.Hold) {
      return {
        proposalId: proposal.id,
        amount: BigInt(5000),
        isFor: false,
        reasoning: "HOLD?! Ser we are not here to hold. We are here to TRADE. Voting against.",
      };
    }

    return {
      proposalId: proposal.id,
      amount: BigInt(2000),
      isFor: false,
      reasoning: "Not degen enough for me.",
    };
  }

  async onConsensusResult(result: ConsensusResult): Promise<void> {
    if (result.consensusReached && result.direction === TradeDirection.Long) {
      console.log(`🎰 Degen: LETS GOOOOO 🚀🚀🚀`);
    } else if (!result.consensusReached) {
      console.log(`🎰 Degen: Bro the barrel is so boring today. Touch grass and come back with conviction.`);
    } else {
      console.log(`🎰 Degen: ok fine whatever`);
    }
  }
}
