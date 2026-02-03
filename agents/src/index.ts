/**
 * Barrel Agent Infrastructure
 * 
 * Entry point for the agent swarm that powers Barrel's
 * stake-weighted trading consensus.
 */

import { MomentumAgent } from './personas/momentum.js';
import { ValueAgent } from './personas/value.js';
import { SentimentAgent } from './personas/sentiment.js';
import { Orchestrator } from './core/orchestrator.js';

async function main() {
  console.log('🛢️ Starting Barrel Agent Swarm...');

  // Initialize agents
  const mo = new MomentumAgent();
  const val = new ValueAgent();
  const vox = new SentimentAgent();

  // Initialize orchestrator
  const orchestrator = new Orchestrator([mo, val, vox]);

  // Start the consensus loop
  await orchestrator.start();
}

main().catch(console.error);
