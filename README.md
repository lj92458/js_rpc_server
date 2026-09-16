# JS RPC Server — DeFi 链上交易 RPC 服务

> **🌐 语言切换 / Language:** [English](README.en.md)

---

## 📌 项目简介

JS RPC Server 是一个基于 **Node.js** 的生产级 **DeFi 远程调用服务**，将 Uniswap V3、1inch DEX 聚合器等核心 DeFi 能力封装为标准化的 RPC 接口。项目内置**智能合约钱包 (Multicall3)**，可将多个任意合约调用原子打包为一个事务、统一回滚，确保交易安全性。支持 5 条 EVM 兼容链，使任何语言、任何平台的客户端都能以极低接入成本调用链上交易能力。

---

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js | 高性能异步 I/O，适合高频链上交互 |
| **RPC 框架** | [Hprose](https://github.com/hprose/hprose-nodejs) | 跨语言、高性能远程过程调用框架，支持多语言客户端 |
| **区块链交互** | [ethers.js v6](https://docs.ethers.org/v6/) | 以太坊钱包管理、合约调用、交易签名与发送 |
| **DEX 协议** | [@uniswap/v3-sdk](https://docs.uniswap.org/sdk/v3/overview) | Uniswap V3 交易路由、报价计算、流动性管理 |
| **DEX 聚合器** | [@1inch/fusion-sdk](https://docs.1inch.io/) + 1inch API | 跨 DEX 最优路径聚合交易、1inch Oracle 预言机报价 |
| **合约内核** | [@uniswap/v3-core](https://docs.uniswap.org/contracts/v3/overview) | Uniswap V3 链上合约 ABI，用于直接读取池状态 |
| **合约封装** | [@uniswap/v3-periphery](https://docs.uniswap.org/contracts/v3/reference/periphery/base/BlockTimestamp) | SwapRouter、QuoterV2、TickLens 等外围合约 |
| **智能合约钱包** | Multicall3 (自建) | 多笔交易原子打包、统一回滚，确保多步操作的一致性 |
| **批量读取** | [ethers-multicall](https://github.com/Destiner/ethers-multicall) | 多合约批量读取（如余额查询），大幅减少 RPC 调用次数 |
| **数据抽象** | [@uniswap/sdk-core](https://docs.uniswap.org/sdk/core/reference/overview) | Token、Price、CurrencyAmount 等共享数据结构 |
| **zkSync 支持** | [zksync-web3](https://www.npmjs.com/package/zksync-web3) | zkSync Era 链交互支持 |
| **WETH 协议** | WETH9 + [WETH10](https://www.npmjs.com/package/weth10) | 双协议支持：WETH9 标准 + WETH10 扩展（withdrawTo / depositTo） |
| **本地存储** | SQLite3 (node-sqlite) | 轻量级持久化，用于历史状态记录与收益分析 |
| **定时调度** | node-schedule | 定时采集链上数据，支持收益曲线生成 |
| **进程管理** | PM2 | 生产级进程守护、自动重启、日志管理 |
| **HTTP 客户端** | Axios (keep-alive) | 长连接复用，加速 1inch API 调用 |
| **精度计算** | JSBI / big.js / decimal.js | 大数与高精度浮点运算，确保链上数据零误差 |
| **图查询** | GraphQL + Apollo Client | 对接 The Graph 子图，查询历史流动性快照 |

---

## ✨ 核心功能与亮点

### 🏦 智能合约钱包 — 原子事务打包（核心亮点）
- 基于 **Multicall3** 合约自建智能合约钱包，将多个任意合约调用打包为**单个 EVM 事务**
- **统一原子回滚**：多步操作中任一步失败，整个事务自动回滚，杜绝中间状态导致的资产损失
- 支持 `aggregate3Value`（批量打包）和 `aggregate3ValueSingle`（单笔封装）两种模式
- 典型场景：`addTwoOrderOneInch` 将两笔 1inch 交易在同一个 EVM 调用栈中完成，保证两笔交易要么都成功、要么都失败

### 🔗 多链 RPC 服务架构
- 通过 Hprose 暴露标准化 RPC 接口，**任意语言客户端**（Python / Java / Go / C# 等）均可直接调用
- 支持 **本地节点 (Local)**、**主网 (Mainnet)**、**浏览器钱包 (Wallet Extension)** 三种运行模式
- 支持 **5 条 EVM 兼容链**：Ethereum (1)、Polygon (137)、Arbitrum (42161)、Optimism (10)、zkSync Era (324)

### 💱 Uniswap V3 + 1inch 双引擎交易
- **Uniswap V3 完整交易链路** — 基于 `@uniswap/v3-sdk` 的 Route + Trade 构造，支持单跳/多跳交易路径
- **1inch DEX 聚合器** — 通过 1inch API 实现跨 DEX 最优路径聚合交易，获取全网最佳汇率
- **滑点控制** — 精确的滑点预计算与校验，支持保守型与激进型两种策略
- **交易执行** — 通过 SwapRouter / 1inch AggregationRouter 合约提交链上交易
- **Token 授权** — 内置 ERC-20 授权流程

### 🔄 自动套利系统
- 预定义多条套利路由（如 USDT→ETH→USDC→USDT、USDT→ETH→WBTC→USDT 等）
- 利用 Uniswap V3 的 `EXACT_OUTPUT` 递归嵌套特性，实现**零本金套利**：池子先借出代币，链式偿还，最终只需偿还价差
- 支持多档位交易额自动探测（1000 ~ 8000 USDT），寻找最优利润空间

### 📊 DEX→CEX 桥梁：AMM 流动性转化为订单簿（核心创新）

**核心思想：将 Uniswap V3 的 AMM 连续流动性，数学等价地离散化为上百个买卖挂单，输出与 CEX 完全相同格式的 bids / asks。**

这意味着 DEX 和 CEX 的行情被统一到同一种数据格式——量化策略无需分别适配 AMM 和订单簿两套逻辑，拿到的盘口数据可以直接与币安等 CEX 对比价差，发现套利机会。

**工作原理：**
- 通过 `TickLens` 合约批量读取链上 Tick 位图，结合 `MyTickListDataProvider` 二分查找，获取完整的链上流动性分布
- 基于恒定乘积公式 `x * y = k`，模拟输入不同金额时的执行价格，逐档生成 price + volume 挂单
- 输出格式：`{asks: [[price, volume], ...], bids: [[price, volume], ...]}`，与任何 CEX 的盘口数据结构完全一致

**事件驱动，零轮询：**
- 订单簿**不是轮询刷新**的。系统监听 EVM 链上事件（`Mint` 注资、`Burn` 撤资），只有当流动性发生变化时才触发 Tick 数据更新和订单簿重建
- 订单簿发生变化后，**主动推送**给下游系统，不依赖下游轮询
- 这种事件驱动架构极其节能：链上无变化时零计算开销，有变化时毫秒级响应

### 🔍 零 Gas 报价预计算
- 通过 `QuoterV2` 合约 + `provider.call()` 实现**完全免费的链上报价**，不消耗任何 Gas
- 结合 `Pool.getOutputAmount()` 双重校验，确保报价精度
- **1inch Oracle 预言机** — 在没有 Uniswap 的链上，自动切换至 1inch Oracle 获取 ETH 价格

### 💰 智能资产管理系统
- **Multicall 批量查询** — 使用 `ethers-multicall` 一次 RPC 调用批量查询多个代币余额
- **自动 ETH/WETH 余额管理** — ETH 低于阈值时自动从 WETH 转换；智能合约钱包自动将 Gas 费转入 EOA 账户
- **WETH9/WETH10 双协议** — 支持 WETH10 的 `withdrawTo`/`depositTo` 一步完成转换+转账
- **白名单提币安全** — 提币地址严格限制在白名单内，防止资产误转
- 实时获取 Gas 价格与 ETH 兑主流计价货币汇率

### 🛡 生产级交易保障
- **超时自动取消** — 交易打包超时时，自动发送高空交易费的空交易覆盖原交易，防止挂起
- **三重重试机制** — 网络异常时自动重试 3 次，逐步增加间隔
- **EIP-1559 支持** — 统一构造 `maxFeePerGas` / `maxPriorityFeePerGas`，兼容伦敦硬分叉后的 Gas 机制

### ⚡ 智能缓存与事件驱动
- 订单簿由 EVM 事件（Mint/Burn）驱动刷新，非轮询，链上无变化时零计算开销
- Pool 价格状态通过 Swap 事件监听，价格变动时自动触发订单簿重建
- Tick 数据按字节窗口缓存，仅当 `tickCurrent` 跨入新字节时才重新获取
- 同时支持 1inch 聚合行情（`bookProductOneInch`），包含路由协议和预估 Gas

---

## 🚀 快速开始

### 前置条件
- **Node.js** >= 16
- **PM2** (全局安装: `npm install -g pm2`)
- 确保 `/var/js_rpc_server/` 目录存在（SQLite 数据库存储路径）

### 安装依赖
```bash
npm install
```

### 启动服务
```bash
pm2 start index.cjs --name eth --watch -- <password> <chainId> [LOCAL | MAINNET | WALLET_EXTENSION]
```

**参数说明：**
| 参数 | 说明 | 示例 |
|------|------|------|
| `password` | 钱包加密密码 | `mypassword` |
| `chainId` | 链网络编号 | `1` (Ethereum), `42161` (Arbitrum), `10` (Optimism), `137` (Polygon), `324` (zkSync Era) |
| `env` | 运行环境 | `LOCAL` / `MAINNET` / `WALLET_EXTENSION` |

### 停止服务
```bash
pm2 stop eth
```

---

## 📡 RPC 接口一览

| 方法 | 说明 |
|------|------|
| `queryTokenBalance(address, symbols)` | Multicall 批量查询代币余额 |
| `sendToken(symbol, address, amount, ...)` | 发送代币（白名单安全校验 + 自动 WETH 转换） |
| `receiveToken(symbol, txId, amount, ...)` | 接收代币（自动 ETH↔WETH 转换） |
| `bookProduct(pair, fee)` | 模拟 Uniswap V3 链上订单簿（买卖盘口） |
| `bookProductOneInch(pair, goodsAmount, moneyAmount)` | 1inch 聚合行情查询（跨 DEX 最优报价） |
| `getGasPriceGweiAndEthPrice(symbol, fee)` | 查询 Gas 价格与 ETH 汇率（支持 1inch Oracle 回退） |
| `addOrder(pair, type, price, volume, ...)` | 提交 Uniswap V3 交易订单 |
| `addOrderOneInch(pair, type, price, volume, ...)` | 提交 1inch 聚合交易订单 |
| `addTwoOrderOneInch(...)` | 提交两笔 1inch 订单（智能合约钱包原子打包） |
| `cancelOrder(gasPriceGwei, maxWaitSeconds, nonce)` | 取消挂起交易（空交易覆盖） |
| `getProp()` | 获取系统配置属性 |
| `getConfig()` | 获取链/代币配置信息 |

---

## ⚠️ 重要提示

1. **Token 授权**：交易前需调用 `getTokenTransferApproval()` 对 SwapRouter 合约进行授权，或在 Etherscan 上手动调用 `approve`
2. **WETH 准备**：请确保账户持有 **WETH**（而非 ETH）。WETH 不足时，请在 Etherscan 调用 WETH 合约的 `deposit` 函数充值
3. **数据单位**：所有涉及 `x * y = k`、`sqrtPriceX96`、`liquidity` 等计算的数据，统一使用最小单位（wei / satoshi）

---

## 📐 架构概览

```
┌──────────────────────────────────────────────────────┐
│              客户端 (任意语言)                          │
│         Python / Java / Go / C# / JS                 │
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
│  │          lib/ (核心业务层)                         │  │
│  │  trade.js │ pool.js │ providers.js │ constant.js │  │
│  │  MyTickListDataProvider.js                       │  │
│  └──────┬──────────────┬───────────────────────────┘  │
│         │              │                               │
│  ┌──────▼──────┐ ┌─────▼───────────────────────────┐  │
│  │  SQLite3    │ │ Multicall3 智能合约钱包           │  │
│  │  历史数据    │ │ (原子打包 / 统一回滚)             │  │
│  └─────────────┘ └─────┬───────────────────────────┘  │
└────────────────────────┼──────────────────────────────┘
                         │
     ┌───────────────────▼───────────────────────┐
     │           EVM 区块链网络                     │
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
