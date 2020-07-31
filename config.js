const uniswapSDK = require('@uniswap/sdk')
const providers =require('@ethersproject/providers')

const chainId = uniswapSDK.ChainId.MAINNET
const provider = providers.getDefaultProvider(chainId, {
    etherscan: "B3HWMMWXRKKDD6RQ69S2G5MCF6NTD35NZW",
    infura: "34922f85dc48411c9f1312b6031a71d6",
    //alchemy:
})
const serverUri="http://127.0.0.1:8090"

const tokens = {
    eth: {symbol: "eth", address: null,decimals:18},
    weth: {symbol: "weth", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",decimals:18},
    usdc: {symbol: "usdc", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",decimals:6},
    usdt: {symbol: "usdt", address: "0xdac17f958d2ee523a2206206994597c13d831ec7",decimals:6},
    snx: {symbol: "snx", address: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f",decimals:18},
    link: {symbol: "link", address: "0x514910771af9ca656af840dff83e8264ecf986ca",decimals:18},
    dai: {symbol: "dai", address: "0x6b175474e89094c44da98b954eedeac495271d0f",decimals:18},
    lend: {symbol: "lend", address: "0x80fB784B7eD66730e8b1DBd9820aFD29931aab03",decimals:18},
    bat: {symbol: "bat", address: "0x0d8775f648430679a709e98d2b0cb6250d2887ef",decimals:18},
    wbtc: {symbol: "wbtc", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",decimals:8},
    mkr: {symbol: "mkr", address: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",decimals:18},
    ampl: {symbol: "ampl", address: "0xd46ba6d942050d489dbd938a2c909a5d5039a161",decimals:9},
    dmg: {symbol: "dmg", address: "0xEd91879919B71bB6905f23af0A68d231EcF87b14",decimals:18},
    zrx: {symbol: "zrx", address: "0xe41d2489571d322189246dafa5ebde1f4699f498",decimals:18},
    comp: {symbol: "comp", address: "0xc00e94cb662c3520282e6f5717214004a7f26888",decimals:18},
    knc: {symbol: "knc", address: "0xdd974d5c2e2928dea5f71b9825b8b646686bd200",decimals:18},
    renbtc: {symbol: "renbtc", address: "0xeb4c2781e4eba804ce9a9803c67d0893436bb27d",decimals:8},


}


exports.chainId = chainId
exports.provider = provider
exports.tokens = tokens
exports.serverUri=serverUri