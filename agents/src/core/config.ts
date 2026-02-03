/**
 * Configuration for Barrel agents
 */

export interface BarrelConfig {
  // Chain
  chainId: number;
  rpcUrl: string;
  
  // Contracts
  consensusAddress: string;
  tokenAddress: string;
  vaultAddress: string;
  
  // Agent wallets
  agentPrivateKeys: {
    mo: string;
    vox: string;
    degen: string;
  };
  
  // Data sources
  pythEndpoint: string;
  xApiKey: string;
  nadFunAddress: string;
  
  // Orchestrator
  pollIntervalMs: number;
  proposalTimeoutMs: number;
}

export function loadConfig(): BarrelConfig {
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  };

  const optional = (key: string, defaultValue: string): string => {
    return process.env[key] || defaultValue;
  };

  return {
    // Chain - Monad
    chainId: parseInt(optional('CHAIN_ID', '1')), // TODO: Monad chain ID
    rpcUrl: required('MONAD_RPC_URL'),
    
    // Contracts
    consensusAddress: required('CONSENSUS_ADDRESS'),
    tokenAddress: required('TOKEN_ADDRESS'),
    vaultAddress: required('VAULT_ADDRESS'),
    
    // Agent wallets
    agentPrivateKeys: {
      mo: required('MO_PRIVATE_KEY'),
      vox: required('VOX_PRIVATE_KEY'),
      degen: required('DEGEN_PRIVATE_KEY'),
    },
    
    // Data sources
    pythEndpoint: optional('PYTH_ENDPOINT', 'https://hermes.pyth.network'),
    xApiKey: optional('XAI_API_KEY', ''),
    nadFunAddress: optional('NADFUN_ADDRESS', ''),
    
    // Orchestrator
    pollIntervalMs: parseInt(optional('POLL_INTERVAL_MS', '5000')),
    proposalTimeoutMs: parseInt(optional('PROPOSAL_TIMEOUT_MS', '30000')),
  };
}

// Monad testnet config (placeholder)
export const MONAD_TESTNET = {
  chainId: 10143, // Placeholder - get actual from docs
  rpcUrl: 'https://testnet-rpc.monad.xyz',
};

// Pyth price feed IDs (Monad)
export const PYTH_FEED_IDS = {
  'ETH/USD': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'BTC/USD': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'SOL/USD': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'MON/USD': '', // TODO: Get Monad native token feed ID
};
