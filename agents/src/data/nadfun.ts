/**
 * Nad.fun Integration
 * Monitors new token launches for Degen agent
 */

import { createPublicClient, http, parseAbiItem, type PublicClient, type Log } from 'viem';

export interface NadFunLaunch {
  tokenAddress: string;
  name: string;
  symbol: string;
  creator: string;
  initialSupply: bigint;
  bondingCurveProgress: number; // 0-100
  marketCap: bigint;
  launchedAt: number;
  blockNumber: bigint;
  txHash: string;
}

export interface BondingCurveState {
  tokenAddress: string;
  currentPrice: bigint;
  totalSupply: bigint;
  collateral: bigint;
  progress: number; // 0-100, 100 = graduated
  graduated: boolean;
}

// Nad.fun contract events (placeholder ABIs - need actual from docs)
const TOKEN_CREATED_EVENT = parseAbiItem(
  'event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 initialSupply)'
);

const TRADE_EVENT = parseAbiItem(
  'event Trade(address indexed token, address indexed trader, bool isBuy, uint256 tokenAmount, uint256 ethAmount)'
);

const GRADUATED_EVENT = parseAbiItem(
  'event Graduated(address indexed token, address indexed dexPool, uint256 liquidity)'
);

export class NadFunClient {
  private client: PublicClient;
  private contractAddress: string;
  private recentLaunches: NadFunLaunch[] = [];
  private watchedTokens: Set<string> = new Set();

  constructor(rpcUrl: string, contractAddress: string) {
    this.client = createPublicClient({
      transport: http(rpcUrl),
    });
    this.contractAddress = contractAddress;
  }

  /**
   * Start watching for new token launches
   */
  async watchLaunches(callback: (launch: NadFunLaunch) => void): Promise<void> {
    if (!this.contractAddress) {
      console.warn('No NADFUN_ADDRESS configured, skipping launch monitoring');
      return;
    }

    try {
      // Watch for TokenCreated events
      this.client.watchContractEvent({
        address: this.contractAddress as `0x${string}`,
        abi: [TOKEN_CREATED_EVENT],
        eventName: 'TokenCreated',
        onLogs: (logs) => {
          for (const log of logs) {
            const launch = this.parseTokenCreatedLog(log);
            if (launch) {
              this.recentLaunches.push(launch);
              this.watchedTokens.add(launch.tokenAddress);
              callback(launch);
            }
          }
        },
      });

      console.log('👀 Watching Nad.fun for new launches...');
    } catch (error) {
      console.error('Error watching Nad.fun:', error);
    }
  }

  /**
   * Get recent launches (from cache)
   */
  getRecentLaunches(maxAge: number = 24 * 60 * 60 * 1000): NadFunLaunch[] {
    const cutoff = Date.now() - maxAge;
    return this.recentLaunches.filter(l => l.launchedAt > cutoff);
  }

  /**
   * Check bonding curve progress for a token
   */
  async getBondingCurveState(tokenAddress: string): Promise<BondingCurveState | null> {
    if (!this.contractAddress) return null;

    try {
      // Call contract to get bonding curve state
      // This is a placeholder - actual implementation depends on Nad.fun contract
      const result = await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        abi: [{
          name: 'getBondingCurve',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'token', type: 'address' }],
          outputs: [
            { name: 'currentPrice', type: 'uint256' },
            { name: 'totalSupply', type: 'uint256' },
            { name: 'collateral', type: 'uint256' },
            { name: 'graduated', type: 'bool' },
          ],
        }],
        functionName: 'getBondingCurve',
        args: [tokenAddress as `0x${string}`],
      }) as [bigint, bigint, bigint, boolean];

      // Calculate progress (simplified - actual formula depends on contract)
      const graduationThreshold = BigInt(50000 * 1e18); // ~$50K
      const progress = Math.min(100, Number(result[2] * BigInt(100) / graduationThreshold));

      return {
        tokenAddress,
        currentPrice: result[0],
        totalSupply: result[1],
        collateral: result[2],
        progress,
        graduated: result[3],
      };
    } catch (error) {
      console.error('Error getting bonding curve state:', error);
      return null;
    }
  }

  /**
   * Check if a token is a good early entry
   */
  async isGoodEntry(tokenAddress: string): Promise<{ good: boolean; reason: string }> {
    const state = await this.getBondingCurveState(tokenAddress);
    
    if (!state) {
      return { good: false, reason: 'Could not fetch bonding curve state' };
    }

    if (state.graduated) {
      return { good: false, reason: 'Token already graduated' };
    }

    if (state.progress < 10) {
      return { good: true, reason: `Very early! Only ${state.progress}% through curve` };
    }

    if (state.progress < 30) {
      return { good: true, reason: `Early entry at ${state.progress}% progress` };
    }

    if (state.progress < 60) {
      return { good: false, reason: `Mid-curve at ${state.progress}%, risky entry` };
    }

    return { good: false, reason: `Late entry at ${state.progress}%, near graduation` };
  }

  private parseTokenCreatedLog(log: Log): NadFunLaunch | null {
    try {
      // Parse log args (placeholder - actual depends on event structure)
      const args = (log as any).args || {};
      
      return {
        tokenAddress: args.token,
        name: args.name || 'Unknown',
        symbol: args.symbol || '???',
        creator: args.creator,
        initialSupply: args.initialSupply || BigInt(0),
        bondingCurveProgress: 0,
        marketCap: BigInt(0),
        launchedAt: Date.now(),
        blockNumber: log.blockNumber || BigInt(0),
        txHash: log.transactionHash || '',
      };
    } catch {
      return null;
    }
  }
}

// Singleton
let nadFunClient: NadFunClient | null = null;

export function getNadFunClient(rpcUrl?: string, contractAddress?: string): NadFunClient | null {
  if (!nadFunClient && rpcUrl && contractAddress) {
    nadFunClient = new NadFunClient(rpcUrl, contractAddress);
  }
  return nadFunClient;
}
