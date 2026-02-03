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

import { MomentumAgent } from './personas/momentum.js';
import { SentimentAgent } from './personas/sentiment.js';
import { DegenAgent } from './personas/degen.js';
import { Orchestrator } from './core/orchestrator.js';

async function main() {
  console.log('🛢️ Starting Barrel Agent Swarm...');
  console.log('');
  console.log('  🐒 Mo     — Momentum trader, trend chaser');
  console.log('  📡 Vox    — Sentiment reader, CT watcher');
  console.log('  🎰 Degen  — YOLO ape, Nad.fun hunter');
  console.log('');

  // Initialize agents
  const mo = new MomentumAgent();
  const vox = new SentimentAgent();
  const degen = new DegenAgent();

  // Initialize orchestrator
  const orchestrator = new Orchestrator([mo, vox, degen]);

  // Start the consensus loop
  await orchestrator.start();
}

main().catch(console.error);
