# JS RPC Server — DeFi On-Chain Trading RPC Service

> **🌐 Language / 语言切换:** [中文](README.md)

---

## 📌 Overview

JS RPC Server is a production-grade **DeFi Remote Procedure Call service** built on **Node.js**, wrapping the core capabilities of Uniswap V3, 1inch DEX Aggregator, and more into standardized RPC interfaces. The project features a **Smart Contract Wallet (Multicall3)** that atomically batches multiple arbitrary contract calls into a single transaction with unified rollback, ensuring transaction safety. Supporting 5 EVM-compatible chains, it enables clients in **any language on any platform** to access on-chain trading capabilities with minimal integration effort.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js | High-performance async I/O, ideal for frequent on-chain interactions |
| **RPC Framework** | [Hprose](https://github.com/hprose/hprose-nodejs) | Cross-language, high-performance RPC framework with multi-language client support |
| **Blockchain Interaction** | [ethers.js v6](https://docs.ethers.org/v6/) | Ethereum wallet management, contract calls, transaction signing & broadcasting |
| **DEX Protocol** | [@uniswap/v3-sdk](https://docs.uniswap.org/sdk/v3/overview) | Uniswap V3 trade routing, quote computation, liquidity management |
| **DEX Aggregator** | [@1inch/fusion-sdk](https://docs.1inch.io/) + 1inch API | Cross-DEX optimal path aggregation, 1inch Oracle price feeds |
| **Contract Core** | [@uniswap/v3-core](https://docs.uniswap.org/contracts/v3/overview) | Uniswap V3 on-chain contract ABIs for direct pool state reads |
| **Contract Wrappers** | [@uniswap/v3-periphery](https://docs.uniswap.org/contracts/v3/reference/periphery/base/BlockTimestamp) | SwapRouter, QuoterV2, TickLens and other peripheral contracts |
| **Smart Contract Wallet** | Multicall3 (Custom) | Atomic transaction batching with unified rollback for multi-step consistency |
| **Batch Reads** | [ethers-multicall](https://github.com/Destiner/ethers-multicall) | Multi-contract batch reads (e.g. balance queries), drastically reducing RPC calls |
| **Data Abstractions** | [@uniswap/sdk-core](https://docs.uniswap.org/sdk/core/reference/overview) | Shared data structures: Token, Price, CurrencyAmount |
| **zkSync Support** | [zksync-web3](https://www.npmjs.com/package/zksync-web3) | zkSync Era chain interaction support |
| **WETH Protocol** | WETH9 + [WETH10](https://www.npmjs.com/package/weth10) | Dual protocol: WETH9 standard + WETH10 extensions (withdrawTo / depositTo) |
| **Local Storage** | SQLite3 (node-sqlite) | Lightweight persistence for historical state tracking & profit analysis |
| **Task Scheduling** | node-schedule | Scheduled on-chain data collection for yield curve generation |
| **Process Management** | PM2 | Production-grade process daemon, auto-restart, log management |
| **HTTP Client** | Axios (keep-alive) | Persistent connections for accelerated 1inch API calls |
| **Precision Math** | JSBI / big.js / decimal.js | Big-number & high-precision floating-point arithmetic for on-chain accuracy |
| **Graph Queries** | GraphQL + Apollo Client | Integration with The Graph subgraph for historical liquidity snapshots |

---

## ✨ Key Features & Highlights

### 🏦 Smart Contract Wallet — Atomic Transaction Batching (Core Highlight)
- Custom smart contract wallet built on **Multicall3**, batching multiple arbitrary contract calls into a **single EVM transaction**
- **Unified atomic rollback**: If any step fails, the entire transaction is automatically reverted, preventing asset loss from intermediate states
- Supports both `aggregate3Value` (batch packaging) and `aggregate3ValueSingle` (single packaging) modes
- Typical scenario: `addTwoOrderOneInch` completes two 1inch trades within the same EVM call stack, guaranteeing both succeed or both fail

### 🔗 Multi-Chain RPC Service Architecture
- Exposes standardized RPC interfaces via Hprose — **clients in any language** (Python / Java / Go / C# etc.) can connect directly
- Supports three operating modes: **Local Node**, **Mainnet**, and **Browser Wallet Extension**
- Supports **5 EVM-compatible chains**: Ethereum (1), Polygon (137), Arbitrum (42161), Optimism (10), zkSync Era (324)

### 💱 Uniswap V3 + 1inch Dual-Engine Trading
- **Full Uniswap V3 Trade Lifecycle** — Route + Trade building via `@uniswap/v3-sdk`, supporting single-hop and multi-hop trade paths
- **1inch DEX Aggregator** — Cross-DEX optimal path aggregation via 1inch API for the best available rates across all DEXes
- **Slippage Control** — Precise slippage pre-computation and validation with both conservative and aggressive strategies
- **Trade Execution** — On-chain transaction submission via SwapRouter / 1inch AggregationRouter contracts
- **Token Approval** — Built-in ERC-20 approval workflow

### 🔄 Automated Arbitrage System
- Pre-defined multi-leg arbitrage routes (e.g. USDT→ETH→USDC→USDT, USDT→ETH→WBTC→USDT)
- Leverages Uniswap V3's `EXACT_OUTPUT` recursive nesting for **zero-capital arbitrage**: pools lend tokens first, debts are repaid in a chain reaction, only the price difference needs to be covered
- Supports multi-tier trade amount auto-probing (1,000 ~ 8,000 USDT) to find optimal profit margins

### 📊 DEX→CEX Bridge: AMM Liquidity Transformed into Order Book (Core Innovation)

**Core idea: Mathematically transform Uniswap V3's continuous AMM liquidity into hundreds of discrete bid/ask orders, outputting bids / asks in the exact same format as a CEX order book.**

This unifies DEX and CEX market data into one single data format — quantitative strategies don't need separate logic for AMM pools and order books. The output can be directly compared against Binance or any CEX to spot price discrepancies and arbitrage opportunities.

**How it works:**
- Batch-reads on-chain Tick bitmaps via the `TickLens` contract, combined with `MyTickListDataProvider` for efficient binary search, obtaining the complete on-chain liquidity distribution
- Based on the constant product formula `x * y = k`, simulates execution prices for varying input amounts, generating price + volume orders tick by tick
- Output format: `{asks: [[price, volume], ...], bids: [[price, volume], ...]}` — fully compatible with any CEX order book data structure

**Event-Driven, Zero Polling:**
- The order book is **NOT refreshed by polling**. The system listens to EVM on-chain events (`Mint` for liquidity injection, `Burn` for liquidity withdrawal) — Tick data updates and order book rebuilds are triggered ONLY when liquidity actually changes
- When the order book changes, it **actively pushes** updates to downstream systems — no downstream polling required
- This event-driven architecture is extremely energy-efficient: zero computational overhead when the chain is idle, millisecond-level response when changes occur

### 🔍 Zero-Gas Quote Pre-Computation
- Achieves **completely free on-chain quoting** via `QuoterV2` contract + `provider.call()`, consuming zero gas
- Dual verification with `Pool.getOutputAmount()` ensures quote accuracy
- **1inch Oracle** — Automatically falls back to 1inch Oracle for ETH pricing on chains without Uniswap

### 💰 Smart Asset Management System
- **Multicall Batch Queries** — Uses `ethers-multicall` to query multiple token balances in a single RPC call
- **Auto ETH/WETH Balance Management** — Automatically converts WETH to ETH when balance drops below threshold; smart contract wallet auto-transfers gas fees to EOA account
- **WETH9/WETH10 Dual Protocol** — Supports WETH10's `withdrawTo`/`depositTo` for one-step convert-and-transfer
- **Whitelist Withdrawal Security** — Withdrawal addresses strictly limited to whitelist, preventing accidental transfers
- Real-time gas price and ETH-to-major-quote-asset exchange rate retrieval

### 🛡 Production-Grade Trade Protection
- **Auto-cancel on Timeout** — When transaction packaging times out, automatically sends a high-gas empty transaction to overwrite the pending one
- **Triple Retry Mechanism** — Automatically retries up to 3 times on network errors with increasing intervals
- **EIP-1559 Support** — Unified `maxFeePerGas` / `maxPriorityFeePerGas` construction, compatible with post-London hard fork gas mechanics

### ⚡ Intelligent Caching & Event-Driven Architecture
- Order book refreshed by EVM events (Mint/Burn), not polling — zero computational overhead when chain is idle
- Pool price state monitored via Swap events, automatically triggering order book rebuilds on price changes
- Tick data cached by byte window, only re-fetched when `tickCurrent` crosses into a new byte
- Also supports 1inch aggregated quotes (`bookProductOneInch`), including routing protocols and estimated gas

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** >= 16
- **PM2** (install globally: `npm install -g pm2`)
- Ensure the `/var/js_rpc_server/` directory exists (SQLite database storage path)

### Install Dependencies
```bash
npm install
```

### Start the Service
```bash
pm2 start index.cjs --name eth --watch -- <password> <chainId> [LOCAL | MAINNET | WALLET_EXTENSION]
```

**Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `password` | Wallet encryption password | `mypassword` |
| `chainId` | Chain network ID | `1` (Ethereum), `42161` (Arbitrum), `10` (Optimism), `137` (Polygon), `324` (zkSync Era) |
| `env` | Runtime environment | `LOCAL` / `MAINNET` / `WALLET_EXTENSION` |

### Stop the Service
```bash
pm2 stop eth
```

---

## 📡 RPC API Reference

| Method | Description |
|--------|-------------|
| `queryTokenBalance(address, symbols)` | Multicall batch query of token balances |
| `sendToken(symbol, address, amount, ...)` | Send tokens (whitelist security + auto WETH conversion) |
| `receiveToken(symbol, txId, amount, ...)` | Receive tokens (auto ETH↔WETH conversion) |
| `bookProduct(pair, fee)` | Simulate Uniswap V3 on-chain order book (bid/ask sides) |
| `bookProductOneInch(pair, goodsAmount, moneyAmount)` | 1inch aggregated quote (cross-DEX best pricing) |
| `getGasPriceGweiAndEthPrice(symbol, fee)` | Query gas price and ETH rate (1inch Oracle fallback) |
| `addOrder(pair, type, price, volume, ...)` | Submit Uniswap V3 trade order |
| `addOrderOneInch(pair, type, price, volume, ...)` | Submit 1inch aggregated trade order |
| `addTwoOrderOneInch(...)` | Submit two 1inch orders (atomic batch via smart contract wallet) |
| `cancelOrder(gasPriceGwei, maxWaitSeconds, nonce)` | Cancel pending transaction (empty tx overwrite) |
| `getProp()` | Retrieve system configuration properties |
| `getConfig()` | Retrieve chain and token configuration |

---

## ⚠️ Important Notes

1. **Token Approval**: Before trading, call `getTokenTransferApproval()` to approve the SwapRouter contract, or manually call `approve` on Etherscan
2. **WETH Required**: Ensure your account holds **WETH** (not ETH). If WETH is insufficient, call the `deposit` function on the WETH contract via Etherscan
3. **Data Units**: All calculations involving `x * y = k`, `sqrtPriceX96`, `liquidity`, etc. use the smallest units (wei / satoshi)

---

## 📐 Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│            Clients (Any Language)                      │
│         Python / Java / Go / C# / JS                  │
└──────────────────────┬───────────────────────────────┘
                       │ Hprose RPC (HTTP :8093)
┌──────────────────────▼───────────────────────────────┐
│               JS RPC Server (Node.js)                 │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────┐ │
│  │accountService│ │productService│ │  orderService   │ │
│  │ send/receive │ │ UniV3+1inch  │ │ UniV3+1inch    │ │
│  └──────┬──────┘ └──────┬───────┘ └───────┬────────┘ │
│         │               │                 │           │
│  ┌──────▼───────────────▼─────────────────▼────────┐  │
│  │          lib/ (Core Business Layer)               │  │
│  │  trade.js │ pool.js │ providers.js │ constant.js │  │
│  │  MyTickListDataProvider.js                       │  │
│  └──────┬──────────────┬───────────────────────────┘  │
│         │              │                               │
│  ┌──────▼──────┐ ┌─────▼───────────────────────────┐  │
│  │  SQLite3    │ │ Multicall3 Smart Contract Wallet │  │
│  │  Historical  │ │ (Atomic Batching / Rollback)    │  │
│  │  Data Store  │ │                                 │  │
│  └─────────────┘ └─────┬───────────────────────────┘  │
└────────────────────────┼──────────────────────────────┘
                         │
     ┌───────────────────▼───────────────────────┐
     │         EVM Blockchain Networks             │
     │  Ethereum / Arbitrum / Optimism /          │
     │  Polygon / zkSync Era                      │
     │                                            │
     │  + Uniswap V3 + 1inch AggregationRouter    │
     │  + Multicall3 + 1inch Oracle               │
     └────────────────────────────────────────────┘
```

---

## 📄 License

MIT
