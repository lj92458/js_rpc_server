const uniswapSDK = require('@uniswap/sdk')
const ethers = require('ethers')
const properties= require('./properties.json')
const chainId = uniswapSDK.ChainId.MAINNET
//const chainId = uniswapSDK.ChainId.ROPSTEN
const etherscanAPIKey = 'B3HWMMWXRKKDD6RQ69S2G5MCF6NTD35NZW'
const infuraAPIKey = "34922f85dc48411c9f1312b6031a71d6"
const provider = ethers.getDefaultProvider(chainId, {
    etherscan: etherscanAPIKey,
    infura: infuraAPIKey,
    //alchemy:
})
const jsonWallet = `{"address":"b0d1435590b4f14a5f4414f93489945546162ffc","id":"5a63696f-1fc9-4591-9630-dcdac63dcf1e","version":3,"Crypto":{"cipher":"aes-128-ctr","cipherparams":{"iv":"0aeffda1cdfefa0a6f562aa74ede2818"},"ciphertext":"a05f204b244d12cdb393a8eba901ab01f1bf68da0bf7c0f29eeb6d6405c8f089","kdf":"scrypt","kdfparams":{"salt":"69ef4fc24f87877c2aa16ff0a22c18c31365dcc7aa350a6bf918751e0f0d3001","n":131072,"dklen":32,"p":1,"r":8},"mac":"88b47b8fb496072fd23352fd1a50f7b99d59c15e69141a686eb8135bdc83b18a"},"x-ethers":{"client":"ethers.js","gethFilename":"UTC--2020-08-10T07-30-06.0Z--b0d1435590b4f14a5f4414f93489945546162ffc","mnemonicCounter":"61238297b9e423d2975f57697dcfd834","mnemonicCiphertext":"2852e5451056a74e8a9c0d3a2bc77bd0","path":"m/44'/60'/0'/0/0","locale":"en","version":"0.1"}}`
let wallet
const serverUri = "http://0.0.0.0:8090"
const slippage = "0.002"//允许的滑点。当远程调用没有传来滑点时，才采用默认的滑点
const tokensMAINNET = {
    eth: {symbol: "eth", address: uniswapSDK.WETH[chainId].address, decimals: 18},
    weth: {symbol: "weth", address: uniswapSDK.WETH[chainId].address, decimals: 18},
    usdc: {symbol: "usdc", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6},
    usdt: {symbol: "usdt", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6},
    snx: {symbol: "snx", address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", decimals: 18},
    link: {symbol: "link", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18},
    dai: {symbol: "dai", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18},
    lend: {symbol: "lend", address: "0x80fB784B7eD66730e8b1DBd9820aFD29931aab03", decimals: 18},
    bat: {symbol: "bat", address: "0x0D8775F648430679A709E98d2b0Cb6250d2887EF", decimals: 18},
    wbtc: {symbol: "wbtc", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8},
    mkr: {symbol: "mkr", address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18},
    ampl: {symbol: "ampl", address: "0xD46bA6D942050d489DBd938a2C909A5d5039A161", decimals: 9},
    dmg: {symbol: "dmg", address: "0xEd91879919B71bB6905f23af0A68d231EcF87b14", decimals: 18},
    zrx: {symbol: "zrx", address: "0xE41d2489571d322189246DaFA5ebDe1F4699F498", decimals: 18},
    comp: {symbol: "comp", address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", decimals: 18},
    knc: {symbol: "knc", address: "0xdd974D5C2e2928deA5F71b9825b8b646686BD200", decimals: 18},
    renbtc: {symbol: "renbtc", address: "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D", decimals: 8},
    uma: {symbol: "uma", address: "0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828", decimals: 18},
    ren: {symbol: "ren", address: "0x408e41876cCCDC0F92210600ef50372656052a38", decimals: 18},
    sushi: {symbol: "sushi", address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", decimals: 18},
    yfi: {symbol: "yfi", address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", decimals: 18},
    band: {symbol: "band", address: "0xBA11D00c5f74255f56a5E366F4F77f5A186d7f55", decimals: 18},
    yamv2: {symbol: "yamv2", address: "0xAba8cAc6866B83Ae4eec97DD07ED254282f6aD8A", decimals: 24},
    yfii: {symbol: "yfii", address: "0xa1d0E215a23d7030842FC67cE582a6aFa3CCaB83", decimals: 18},
    susd: {symbol: "susd", address: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51", decimals: 18},
    srm: {symbol: "srm", address: "0x476c5E26a75bd202a9683ffD34359C0CC15be0fF", decimals: 18},
    crv: {symbol: "crv", address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18},

}
const tokensROPSTEN = {
    eth: {symbol: "eth", address: uniswapSDK.WETH[chainId].address, decimals: 18},
    weth: {symbol: "weth", address: uniswapSDK.WETH[chainId].address, decimals: 18},
    dai: {symbol: "dai", address: "0xaD6D458402F60fD3Bd25163575031ACDce07538D", decimals: 18},


}

const dbPath='/var/js_rpc_server/sqlite3.db'

//根据启动参数，对程序进行初始化
function initWallet() {
    let index=3
    if(process.argv.length>index) {
        const args = process.argv.splice(index);

        if (!wallet) {
            wallet = ethers.Wallet.fromEncryptedJsonSync(jsonWallet, args[0]).connect(provider)
            console.log('wallet load succeed.Address:' + wallet.address)
            wallet.getGasPrice().then(r => console.log('gas price:' + ethers.utils.formatUnits(r, "gwei")))
            wallet.getBalance().then(num => console.log("wallet balance:" + ethers.utils.formatEther(num)))

            exports.wallet = wallet
        }
    }
}

async function mnemonicToJson(mnemonic, password) {
    const myWallet = ethers.Wallet.fromMnemonic(mnemonic)

    console.log(myWallet.address)
    let jsonStr = await myWallet.encrypt(password)
    console.log(jsonStr)
    return [myWallet.address, jsonStr]
}
function getProp(){
    return properties
}

function getConfig(){
    return{
        chainId:chainId,
        etherscanAPIKey: exports.etherscanAPIKey,
        infuraAPIKey: exports.infuraAPIKey,
        tokens:exports.tokens,
    }

}

exports.initWallet = initWallet
exports.chainId = chainId
exports.provider = provider
switch (chainId) {
    case uniswapSDK.ChainId.MAINNET:
        exports.tokens = tokensMAINNET
        break;
    case uniswapSDK.ChainId.ROPSTEN:
        exports.tokens = tokensROPSTEN
        break;
    default:
        console.error("没有合适的chainId")
}
exports.serverUri = serverUri

exports.slippage = slippage
exports.infuraAPIKey = infuraAPIKey
exports.etherscanAPIKey = etherscanAPIKey
exports.dbPath=dbPath
exports.getProp=getProp
exports.getConfig=getConfig