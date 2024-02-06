import sdkCore from '@uniswap/sdk-core'
import {SupportedChainId} from '@uniswap/sdk-core'
import IERC20
    from '@uniswap/v3-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json' assert {type: "json"}
import weth10ABI from 'weth10/deployments/mainnet/WETH10.json' assert {type: 'json'}
import weth9ABI
    from '@uniswap/v3-periphery/artifacts/contracts/interfaces/external/IWETH9.sol/IWETH9.json' assert {type: 'json'}

export {IERC20, weth10ABI, weth9ABI}
/*资金池工厂合约，用来创建资金池。也叫UniswapV3Factory */
export const POOL_FACTORY_CONTRACT_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
/* 查询市场行情合约 */
export const QUOTER_CONTRACT_ADDRESS = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e'
/* 路由合约，来自v3-periphery.*/
export const SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564'
/* 最大gas价格，100GW */
export const MAX_FEE_PER_GAS_GWEI = 10 //todo 不同的链，值不同. 单位：gwei
/* 最大加速gas价格，100GW */
export const MAX_PRIORITY_FEE_PER_GAS_GWEI = 10 //todo 不同的链，值不同. 单位：gwei
/* 授权各种合约能动用我的币的最大数量 */
export const TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER = 2000
export const tickLens = '0xbfd8137f7d1516D3ea5cA83523914859ec47F573'
export const uniswapV3Factory = '0x1F98431c8aD98523631AE4a59f267346ea31F984'
/* 1inch的AggregationRouterV5 arbitrum */
export const AggregationRouterV5 = '0x1111111254eeb25477b68fb85ed929f73a960582'
export const multicall3 = '0xcA11bde05977b3631167028862bE2a173976CA11'

export const smartContractWalletAddress = '0x7c487F80BEe3D7aF9047Ee0E790f2B2A8BDBF1eC' //'0xe068a01e11aCfA03A4c8de63dAd451E77a22CFfF'
export const aggregate3ValueAbi = [
    'function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable',
    'function aggregate3ValueSingle(tuple(address target, bool allowFailure, uint256 value, bytes callData) call) payable'
]

//以太主网的币
export const tokens = {
    [SupportedChainId.MAINNET]: {
        eth: sdkCore.Ether.onChain(SupportedChainId.MAINNET),
        weth: sdkCore.WETH9[SupportedChainId.MAINNET],//0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
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
        //matic: new sdkCore.Token(SupportedChainId.POLYGON,"0x0000000000000000000000000000000000001010",18,"matic"),//这个用不上，干脆去掉
        wmatic: new sdkCore.Token(SupportedChainId.POLYGON, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 18, "wmatic"),
        weth: new sdkCore.Token(SupportedChainId.POLYGON, "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18, "weth"),
        usdc: new sdkCore.Token(SupportedChainId.POLYGON, "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", 6, "usdc"),
        usdt: new sdkCore.Token(SupportedChainId.POLYGON, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6, "usdt"),
        wbtc: new sdkCore.Token(SupportedChainId.POLYGON, "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", 8, "wbtc"),
    },
    [SupportedChainId.ARBITRUM_ONE]: {
        eth: sdkCore.Ether.onChain(SupportedChainId.ARBITRUM_ONE),
        weth: sdkCore.WETH9[SupportedChainId.ARBITRUM_ONE],//实际上支持到weth10了。 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
        usdc: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 6, "usdc"),//这是Circle Usdc.  还有一种叫做bridged usdc：0xff970a61a04b1ca14834a43f5de4533ebddb5cc8
        usdt: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", 6, "usdt"),
        wbtc: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", 8, "wbtc"),
    },
    [SupportedChainId.OPTIMISM]: {
        eth: sdkCore.Ether.onChain(SupportedChainId.OPTIMISM),
        weth: sdkCore.WETH9[SupportedChainId.OPTIMISM],
        usdc: new sdkCore.Token(SupportedChainId.OPTIMISM, "0x7f5c764cbc14f9669b88837ca1490cca17c31607", 6, "usdc"),
        usdt: new sdkCore.Token(SupportedChainId.OPTIMISM, "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", 6, "usdt"),
        wbtc: new sdkCore.Token(SupportedChainId.OPTIMISM, "0x68f180fcCe6836688e9084f035309E29Bf0A2095", 8, "wbtc"),
    },
    [324]: { // zksync era
        weth: new sdkCore.Token(324, "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91", 18, "weth"),
        usdc: new sdkCore.Token(324, "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4", 6, "usdc"),
        usdt: new sdkCore.Token(324, "0x493257fd37edb34451f62edf8d2a0c418852ba4c", 6, "usdt"),//todo 这个地址不一定对
        wbtc: new sdkCore.Token(324, "0xbbeb516fb02a01611cbbe0453fe3c580d7281011", 8, "wbtc"),
    },
}
//1inch 价格查询 https://docs.1inch.io/docs/spot-price-aggregator/introduction
export const oneInchConf = { // Custom token:任何不在1inch审核白名单中的ERC20代币，这样的币通常不靠谱、是垃圾币。如何把你的币加入白名单：https://help.1inch.io/en/articles/4878336-how-to-get-a-token-listed-on-1inch
    [SupportedChainId.MAINNET]: {
        oracle: '0x3E1Fe1Bd5a5560972bFa2D393b9aC18aF279fF56',
    },
    [SupportedChainId.POLYGON]: {
        oracle: '0xf023D71EfB08339EA28F0C186AE130c74D44C58c'
    },
    [SupportedChainId.ARBITRUM_ONE]: {
        oracle: '0x59Bc892E1832aE86C268fC21a91fE940830a52b0',
    },
    [SupportedChainId.OPTIMISM]: {
        oracle: '0x59Bc892E1832aE86C268fC21a91fE940830a52b0',
    },
    [43114]: {//avax-c
        oracle: '0xf023D71EfB08339EA28F0C186AE130c74D44C58c',
    },
    [324]: {//zkSync era
        oracle: '0xEE053a8333B7F804bE050B3D73289C6dbbEB2BFd'
    }
}


export const Environment = {
    LOCAL: 'LOCAL',
    MAINNET: 'MAINNET',
    WALLET_EXTENSION: 'WALLET_EXTENSION'
}