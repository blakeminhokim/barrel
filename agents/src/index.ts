/**
 * Barrel Agent Infrastructure
 * 
 * Entry point for the agent swarm that powers Barrel's
 * stake-weighted trading consensus.
 * 
 * Core 3 Agents:
 * - Mo 🐒 (Momentum) — DEX price/volume, trend chasing
 * - Vox 📡 (Sentiment) — X/CT signals, social reads
 * - Degen 🎰 (YOLO) — Nad.fun launches, early entries
 */

import 'dotenv/config';
import { MomentumAgent } from './personas/momentum.js';
import { SentimentAgent } from './personas/sentiment.js';
import { DegenAgent } from './personas/degen.js';
import { Orchestrator } from './core/orchestrator.js';
import { loadConfig, BarrelConfig } from './core/config.js';

async function main() {
  console.log('');
  console.log('🛢️  ╔════════════════════════════════════╗');
  console.log('   ║     BARREL AGENT SWARM v0.1.0      ║');
  console.log('   ╚════════════════════════════════════╝');
  console.log('');
  console.log('  🐒 Mo     — Momentum trader, trend chaser');
  console.log('  📡 Vox    — Sentiment reader, CT watcher');
  console.log('  🎰 Degen  — YOLO ape, Nad.fun hunter');
  console.log('');

  // Load configuration
  let config: BarrelConfig;
  try {
    config = loadConfig();
    console.log('✅ Configuration loaded');
  } catch (error) {
    console.error('❌ Failed to load configuration:', error);
    console.log('');
    console.log('Required environment variables:');
    console.log('  MONAD_RPC_URL        - Monad RPC endpoint');
    console.log('  CONSENSUS_ADDRESS    - BarrelConsensus contract');
    console.log('  TOKEN_ADDRESS        - BarrelToken contract');
    console.log('  VAULT_ADDRESS        - BarrelVault contract');
    console.log('  MO_PRIVATE_KEY       - Mo agent wallet');
    console.log('  VOX_PRIVATE_KEY      - Vox agent wallet');
    console.log('  DEGEN_PRIVATE_KEY    - Degen agent wallet');
    console.log('');
    console.log('Optional:');
    console.log('  PYTH_ENDPOINT        - Pyth API (default: hermes.pyth.network)');
    console.log('  XAI_API_KEY          - xAI API for sentiment');
    console.log('  NADFUN_ADDRESS       - Nad.fun contract');
    console.log('');
    process.exit(1);
  }

  // Initialize agents
  const mo = new MomentumAgent();
  const vox = new SentimentAgent();
  const degen = new DegenAgent();

  // Initialize orchestrator with config
  const orchestrator = new Orchestrator([mo, vox, degen], config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    orchestrator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    orchestrator.stop();
    process.exit(0);
  });

  // Start the consensus loop
  console.log('🚀 Starting consensus loop...');
  await orchestrator.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
