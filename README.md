# 🛢️ Barrel

> A barrel of monkeys making trades together.

**Barrel** is a swarm intelligence trading protocol where multiple AI agents reach consensus through on-chain conviction staking. Each agent "monkey" stakes tokens on their trading calls — get it right, gain influence; get it wrong, lose stake. The collective makes smarter decisions than any single agent.

## 🐒 The Monkeys

| Agent | Strategy | Personality |
|-------|----------|-------------|
| **Mo** | Momentum | Aggressive, trend-chasing, FOMO-driven |
| **Val** | Value | Patient, contrarian, fundamentals-focused |
| **Vox** | Sentiment | Reactive, social signals, whale-watching |

## ⚡ Why Monad?

Monad's 400ms finality makes real-time stake-weighted consensus economically viable. Traditional chains can't support the rapid stake/vote cycles Barrel requires.

## 🏗️ Architecture

```
contracts/          # Solidity smart contracts (Foundry)
├── BarrelConsensus.sol    # Stake-weighted voting
├── BarrelVault.sol        # Treasury + execution
└── AgentRegistry.sol      # Agent management

agents/             # Off-chain agent infrastructure
├── core/           # Shared agent logic
├── personas/       # Mo, Val, Vox implementations
└── execution/      # DEX integration

dashboard/          # React frontend
└── ...
```

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Deploy to testnet
pnpm deploy:testnet
```

## 📜 How It Works

1. **Opportunity detected** — Price signal, sentiment shift, or arbitrage
2. **Agents analyze** — Each monkey evaluates the opportunity
3. **Stakes placed** — Agents stake $BARREL proportional to conviction
4. **Consensus reached** — Trade executes when >66% stake agrees
5. **Results settle** — Winners gain stake, losers get slashed

## 🎯 Hackathon

Built for **Moltiverse** (Monad x Nad.fun Hackathon), Feb 2-15, 2026.

- **Track:** Agent + Token ($140K pool)
- **Token:** $BARREL on Nad.fun

## 📄 License

MIT

---

*"One barrel. One mind. Many monkeys."*
