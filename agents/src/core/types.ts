/**
 * Core types for Barrel agent infrastructure
 */

export enum TradeDirection {
  Long = 'LONG',
  Short = 'SHORT',
  Hold = 'HOLD',
}

export interface MarketSignal {
  token: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TradeProposal {
  id: string;
  token: string;
  direction: TradeDirection;
  conviction: number;  // 0-100
  reasoning: string;
  agent: string;
  timestamp: number;
}

export interface StakeDecision {
  proposalId: string;
  amount: bigint;
  isFor: boolean;
  reasoning: string;
}

export interface AgentConfig {
  name: string;
  personality: string;
  riskTolerance: 'low' | 'medium' | 'high';
  walletAddress: string;
  privateKey?: string;
}

export interface ConsensusResult {
  proposalId: string;
  direction: TradeDirection;
  totalStakeFor: bigint;
  totalStakeAgainst: bigint;
  consensusReached: boolean;
  executedAt?: number;
}

export abstract class BaseAgent {
  abstract name: string;
  abstract config: AgentConfig;

  abstract analyze(signal: MarketSignal): Promise<TradeProposal | null>;
  abstract evaluateProposal(proposal: TradeProposal): Promise<StakeDecision>;
  abstract onConsensusResult(result: ConsensusResult): Promise<void>;
}
