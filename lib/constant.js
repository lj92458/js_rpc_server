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
export const MAX_FEE_PER_GAS_GWEI = 1 //todo 不同的链，值不同. 单位：gwei。Arbitrum 上没有内存池的概念，交易由 Sequencer 以先到先得的方式处理。因此，gas price bid 参数不会影响交易的处理顺序
/* 最大加速gas价格，100GW */
export const MAX_PRIORITY_FEE_PER_GAS_GWEI = 1 //todo 不同的链，值不同. 单位：gwei
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
        usdce: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", 6, "usdce"),
        usdt: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", 6, "usdt"),
        wbtc: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", 8, "wbtc"),
        arb: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0x912CE59144191C1204E64559FE8253a0e49E6548", 18, "arb"),
        link: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", 18, "link"),
        uni: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", 18, "uni"),
        ldo: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60", 18, "ldo"),
        pepe: new sdkCore.Token(SupportedChainId.ARBITRUM_ONE, "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00", 18, "pepe"),

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

/**
 * 在uniV3做循环套利：[eth-usdt100, eth-usdc100, usdt-usdc100],总费率0.03%
 * 或者[eth-usdt100, wbtc-usdt500, wbtc-eth100] 总费率0.07%
 *
 */
export const pools = [//注意：不要调整数组中各元素的位置，否则下面routes会失效！！！

    {id: 0, goods: 'usdt', money: 'usdc', fee: 100, address: null},
    {id: 1, goods: 'eth', money: 'usdt', fee: 500, address: null},
    {id: 2, goods: 'eth', money: 'usdc', fee: 500, address: null},
    {id: 3, goods: 'wbtc', money: 'usdt', fee: 500, address: null},
    {id: 4, goods: 'wbtc', money: 'usdc', fee: 500, address: null},
    {id: 5, goods: 'wbtc', money: 'eth', fee: 500, address: null},
    {id: 6, goods: 'usdt', money: 'usdce', fee: 100, address: null},//0
    {id: 7, goods: 'eth', money: 'usdce', fee: 500, address: null},//2
    {id: 8, goods: 'wbtc', money: 'usdce', fee: 500, address: null},//4

    // 下面是小币种，放在另一个app实例上运行。需要用不同的apiKey.
    //{id: 0, goods: 'eth', money: 'usdt', fee: 500, address: null},
    {id: 9, goods: 'ldo', money: 'eth', fee: 500, address: null},//pepe只跟eth建立的资金池，因此无法套利
    {id: 10, goods: 'ldo', money: 'usdt', fee: 3000, address: null},//
    {id: 11, goods: 'uni', money: 'eth', fee: 500, address: null},
    {id: 12, goods: 'uni', money: 'usdt', fee: 3000, address: null},
    {id: 13, goods: 'link', money: 'eth', fee: 500, address: null},
    {id: 14, goods: 'link', money: 'usdt', fee: 3000, address: null},
    {id: 15, goods: 'arb', money: 'eth', fee: 500, address: null},
    {id: 16, goods: 'arb', money: 'usdt', fee: 500, address: null},

]
/** 把上面pools中的某些pool组成路由，然后实时监控该路由是否有利可图。这里统一规定：路由的起点和终点，必须是usdt
 */
export const routes = [

    [1, 2, 0],//usdt-eth-usdc-usdt 费率0.11%
    [1, 5, 3],//usdt-eth-wbtc-usdt 费率0.15%
    [0, 4, 3],//usdt-usdc-wbtc-usdt 费率0.11%
    [1, 7, 6],//usdt-eth-usdce-usdt 费率0.11%
    [6, 8, 3],//usdt-usdce-wbtc-usdt 费率0.11%

    //下面是小币种，放在另一个app实例上运行。需要用不同的apiKey
    [1, 9, 10],//usdt-eth-pepe-usdt 费率0.4%
    [1, 11, 12],//usdt-eth-uni-usdt 费率0.4%
    [1, 13, 14],//usdt-eth-link-usdt 费率0.4%
    [1, 15, 16],//usdt-eth-arb-usdt 费率0.15%

]
export const autoTradeInSymbol = 'usdt'//自动套利时的输入资金

/**自动套利时的交易额。不要求账户真的有钱，因为这利用了EXACT_OUTPUT的特性：递归嵌套，先给我a币，我用a币来干某些事情，再要求我还b币。
 * 具体来说，假设路由是：usdt-eth , eth-wbtc, wbtc-usdt。从左到右是EXACT_INPUT模式，pool编号是1,2,3; 那么从右到左是EXACT_OUTPUT模式, pool编号就是3,2,1.
 * 每个pool都会先给我我想要的币，在问我要另一种币。在这两步之间，pool还会调用我指定的函数，用来支付给pool另一种币。如果我指定的函数是调用下一个pool，那么实际执行顺序为：
 * 3.1 pool3给我usdt
 * 2.1 pool2给我wbtc
 * 1.1 pool1给我eth
 * 1.2 pool1问我要usdt
 * 2.2 pool2问我要eth
 * 3.2 pool3问我要要wbtc
 * 不难看出：在3.1和3.2之间，夹杂着其它步骤。这其它步骤能为我搞来wbtc，以偿还pool3.
 * 从上到下依次执行，先给我usdt、wbtc、eth，再让我归还usdt、eth、wbtc。所以我的账户上不需要有钱。
 */
export const autoTradeAmountArr = [1000, 2000, 3000, 5000, 8000, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 150000, 200000]
export const atleastEarn = 10

/**从provider查询出的blockNumber有延迟吗？目前已知arbscan和op链延迟了8秒，每隔8秒给出30个区块，因此事件日志都没法利用。
 * 就没有哪个链是不延迟的：以太主网每12秒出一个块，也等于有延迟。它是先打包，等12秒后上链。在上链之前，这个包中的交易已经被执行过了，evm状态已经被更改了，但我就是查不出日志。
 * */
export const providerIsDelayed = true