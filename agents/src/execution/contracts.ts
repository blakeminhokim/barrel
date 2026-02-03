/**
 * Contract Interaction Layer
 * Agents submit proposals and stakes to BarrelConsensus
 */

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseAbi,
  defineChain,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Define Monad chain (placeholder values - update with actual)
const monad = defineChain({
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
  },
});

// Contract ABIs (minimal for interaction)
const CONSENSUS_ABI = parseAbi([
  'function createProposal(address token, uint8 direction, uint256 initialStake) returns (bytes32)',
  'function stake(bytes32 proposalId, uint256 amount, bool isFor)',
  'function claimRewards(bytes32 proposalId)',
  'function expireProposal(bytes32 proposalId)',
  'function getProposal(bytes32 proposalId) view returns ((bytes32 id, address token, uint8 direction, uint256 createdAt, uint256 expiresAt, uint256 totalStakeFor, uint256 totalStakeAgainst, uint8 status, address creator))',
  'function getAgentInfo(address agent) view returns ((bool registered, uint256 totalStaked, uint256 wins, uint256 losses, uint256 cooldownUntil))',
  'function getActiveProposalCount() view returns (uint256)',
]);

const TOKEN_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

export enum TradeDirection {
  Long = 0,
  Short = 1,
  Hold = 2,
}

export enum ProposalStatus {
  Pending = 0,
  Executed = 1,
  Expired = 2,
  Rejected = 3,
}

export interface Proposal {
  id: string;
  token: string;
  direction: TradeDirection;
  createdAt: number;
  expiresAt: number;
  totalStakeFor: bigint;
  totalStakeAgainst: bigint;
  status: ProposalStatus;
  creator: string;
}

export interface AgentInfo {
  registered: boolean;
  totalStaked: bigint;
  wins: number;
  losses: number;
  cooldownUntil: number;
}

export class ContractClient {
  private publicClient;
  private walletClient;
  private account;
  private chain;
  private consensusAddress: `0x${string}`;
  private tokenAddress: `0x${string}`;

  constructor(
    rpcUrl: string,
    privateKey: string,
    consensusAddress: string,
    tokenAddress: string
  ) {
    this.chain = { ...monad, rpcUrls: { default: { http: [rpcUrl] } } };
    
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });

    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(rpcUrl),
    });

    this.consensusAddress = consensusAddress as `0x${string}`;
    this.tokenAddress = tokenAddress as `0x${string}`;
  }

  get address(): string {
    return this.account.address;
  }

  /**
   * Ensure token approval for consensus contract
   */
  async ensureApproval(amount: bigint): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: this.tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'allowance',
      args: [this.account.address, this.consensusAddress],
    });

    if (allowance < amount) {
      const hash = await this.walletClient.writeContract({
        chain: this.chain,
        address: this.tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'approve',
        args: [this.consensusAddress, amount * BigInt(10)],
      });
      
      await this.publicClient.waitForTransactionReceipt({ hash });
      console.log(`✅ Approved ${amount} tokens for consensus contract`);
    }
  }

  /**
   * Create a new trade proposal
   */
  async createProposal(
    token: string,
    direction: TradeDirection,
    stakeAmount: bigint
  ): Promise<{ proposalId: string; txHash: Hash }> {
    await this.ensureApproval(stakeAmount);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.consensusAddress,
      abi: CONSENSUS_ABI,
      functionName: 'createProposal',
      args: [token as `0x${string}`, direction, stakeAmount],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    
    return {
      proposalId: hash, // Simplified - in production, decode from logs
      txHash: hash,
    };
  }

  /**
   * Stake on an existing proposal
   */
  async stake(
    proposalId: string,
    amount: bigint,
    isFor: boolean
  ): Promise<Hash> {
    await this.ensureApproval(amount);

    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.consensusAddress,
      abi: CONSENSUS_ABI,
      functionName: 'stake',
      args: [proposalId as `0x${string}`, amount, isFor],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Claim rewards from a finalized proposal
   */
  async claimRewards(proposalId: string): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      chain: this.chain,
      address: this.consensusAddress,
      abi: CONSENSUS_ABI,
      functionName: 'claimRewards',
      args: [proposalId as `0x${string}`],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  /**
   * Get proposal details
   */
  async getProposal(proposalId: string): Promise<Proposal | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.consensusAddress,
        abi: CONSENSUS_ABI,
        functionName: 'getProposal',
        args: [proposalId as `0x${string}`],
      }) as any;

      return {
        id: result.id,
        token: result.token,
        direction: result.direction as TradeDirection,
        createdAt: Number(result.createdAt),
        expiresAt: Number(result.expiresAt),
        totalStakeFor: result.totalStakeFor,
        totalStakeAgainst: result.totalStakeAgainst,
        status: result.status as ProposalStatus,
        creator: result.creator,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get agent info
   */
  async getAgentInfo(agentAddress?: string): Promise<AgentInfo | null> {
    try {
      const result = await this.publicClient.readContract({
        address: this.consensusAddress,
        abi: CONSENSUS_ABI,
        functionName: 'getAgentInfo',
        args: [(agentAddress || this.account.address) as `0x${string}`],
      }) as any;

      return {
        registered: result.registered,
        totalStaked: result.totalStaked,
        wins: Number(result.wins),
        losses: Number(result.losses),
        cooldownUntil: Number(result.cooldownUntil),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get token balance
   */
  async getBalance(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [this.account.address],
    });
  }

  /**
   * Get active proposal count
   */
  async getActiveProposalCount(): Promise<number> {
    const count = await this.publicClient.readContract({
      address: this.consensusAddress,
      abi: CONSENSUS_ABI,
      functionName: 'getActiveProposalCount',
    });
    return Number(count);
  }

  /**
   * Check if agent is on cooldown
   */
  async isOnCooldown(): Promise<boolean> {
    const info = await this.getAgentInfo();
    if (!info) return true;
    return Date.now() / 1000 < info.cooldownUntil;
  }
}
