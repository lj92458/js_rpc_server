import sdkCore from '@uniswap/sdk-core'
import {SupportedChainId} from '@uniswap/sdk-core'
import IERC20 from '@uniswap/v3-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json' assert {type: "json"}

export {IERC20}
/*资金池工厂合约，用来创建资金池。也叫UniswapV3Factory */
export const POOL_FACTORY_CONTRACT_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
/* 查询市场行情合约 */
export const QUOTER_CONTRACT_ADDRESS = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
/* 路由合约，来自v3-periphery.*/
export const SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
/* 最大gas价格，100GW */
export const MAX_FEE_PER_GAS = 100000000000
/* 最大加速gas价格，100GW */
export const MAX_PRIORITY_FEE_PER_GAS = 100000000000
/* 授权各种合约能动用我的币的最大数量 */
export const TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER = 2000
export const tickLens = '0xbfd8137f7d1516D3ea5cA83523914859ec47F573'
export const uniswapV3Factory = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
//以太主网的币
export const tokens = {
    [SupportedChainId.MAINNET]: {
        eth: sdkCore.Ether.onChain(SupportedChainId.MAINNET),
        weth: sdkCore.WETH9[SupportedChainId.MAINNET],
        usdc: new sdkCore.Token(SupportedChainId.MAINNET, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, "usdc"),
        usdt: new sdkCore.Token(SupportedChainId.MAINNET, "0xdAC17F958D2ee523a2206206994597C13D831ec7", 6, "usdt"),
        wbtc: new sdkCore.Token(SupportedChainId.MAINNET, "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8, "wbtc"),
    },
    [SupportedChainId.GOERLI]: {
        eth: sdkCore.Ether.onChain(SupportedChainId.GOERLI),
        weth: sdkCore.WETH9[SupportedChainId.GOERLI],
        usdc: new sdkCore.Token(SupportedChainId.GOERLI, "0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c", 6, "usdc"),
        usdt: new sdkCore.Token(SupportedChainId.GOERLI, "0x5bcc22abec37337630c0e0dd41d64fd86caee951", 6, "usdt"),

    },
    [SupportedChainId.POLYGON]: {//从info.uniswap.org 或者https://polygonscan.com/tokens?sort=24h_volume_usd&order=desc 可以知道各种币的地址
        matic: new sdkCore.Token(SupportedChainId.POLYGON,"0x0000000000000000000000000000000000001010",18,"matic"),
        wmatic: new sdkCore.Token(SupportedChainId.POLYGON, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 18, "wmatic"),
        weth: new sdkCore.Token(SupportedChainId.POLYGON, "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18, "weth"),
        usdc: new sdkCore.Token(SupportedChainId.POLYGON, "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", 6, "usdc"),
        usdt: new sdkCore.Token(SupportedChainId.POLYGON, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6, "usdt"),
        wbtc: new sdkCore.Token(SupportedChainId.POLYGON, "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", 8, "wbtc"),
    },
}

export const Environment = {
    LOCAL: 'LOCAL',
    MAINNET: 'MAINNET',
    WALLET_EXTENSION: 'WALLET_EXTENSION'
}