/**
 * @uniswap/v3-sdk 用于在uniswap-v3上构建程序的sdk.
 * @uniswap/v3-periphery 对uniswap内核的高度封装.
 * @uniswap/v3-core   uniswap内核.
 * @uniswap/sdk-core 对其它sdk数据结构的抽象，用于多个sdk之间共享数据结构、互相传递数据
 */
import {Environment, tokens as allTokens} from './lib/constant.js'
import {getDefaultProvider, providers, utils, Wallet} from 'ethers'
import {prop} from './properties.js'
export const nativeToken = 'eth'
export const rpc = {
    local: 'http://localhost:8545',
    net1: '',
    net2: '',
    net3: ''
}
export const chainId = Number(process.argv.slice(2)[1]) || 1 //网络编号，由启动参数传来。
export const env = process.argv.slice(2)[2] || 'MAINNET' //当前环境LOCAL, MAINNET, WALLET_EXTENSION
export let tokens = allTokens[chainId] || null
export const etherscanAPIKey = 'B3HWMMWXRKKDD6RQ69S2G5MCF6NTD35NZW'
export const infuraAPIKey = "34922f85dc48411c9f1312b6031a71d6"
export let provider
(function createProvider() {
    //如果是本机客户端
    if (env === Environment.LOCAL) {
        provider = new providers.JsonRpcProvider(rpc.local)
    } else if (env === Environment.MAINNET) {//如果是远程公共服务
        //ethers.js包装过的provider，里面有多个provider，能对比各个provider返回的结果，防止被某个欺骗。
        provider = getDefaultProvider(chainId, {
            etherscan: etherscanAPIKey,
            infura: infuraAPIKey
        })
    } else if (env === Environment.WALLET_EXTENSION) {// 浏览器扩展
        try {
            provider = new providers.Web3Provider(window?.ethereum, 'any')
        } catch (e) {
            console.log('No Wallet Extension Found')
            return null
        }
    } else {
        throw new Error(`未知的env:${env}`)
    }
})()


const jsonWallet = `{"address":"b0d1435590b4f14a5f4414f93489945546162ffc","id":"5a63696f-1fc9-4591-9630-dcdac63dcf1e","version":3,"Crypto":{"cipher":"aes-128-ctr","cipherparams":{"iv":"0aeffda1cdfefa0a6f562aa74ede2818"},"ciphertext":"a05f204b244d12cdb393a8eba901ab01f1bf68da0bf7c0f29eeb6d6405c8f089","kdf":"scrypt","kdfparams":{"salt":"69ef4fc24f87877c2aa16ff0a22c18c31365dcc7aa350a6bf918751e0f0d3001","n":131072,"dklen":32,"p":1,"r":8},"mac":"88b47b8fb496072fd23352fd1a50f7b99d59c15e69141a686eb8135bdc83b18a"},"x-ethers":{"client":"ethers.js","gethFilename":"UTC--2020-08-10T07-30-06.0Z--b0d1435590b4f14a5f4414f93489945546162ffc","mnemonicCounter":"61238297b9e423d2975f57697dcfd834","mnemonicCiphertext":"2852e5451056a74e8a9c0d3a2bc77bd0","path":"m/44'/60'/0'/0/0","locale":"en","version":"0.1"}}`
export let wallet =null
export const serverUri = "http://0.0.0.0:8090"
//export const slippage = "0.002"//允许的滑点。当远程调用没有传来滑点时，才采用默认的滑点


export const dbPath = '/var/js_rpc_server/sqlite3.db'

//根据启动参数，对程序进行初始化
export function initWallet(provider) {
    let index = 2
    if (process.argv.length > index) {//如果附带了两个参数
        const args = process.argv.slice(index)

        if (!wallet) {
            wallet = Wallet.fromEncryptedJsonSync(jsonWallet, args[0]).connect(provider)
            console.log('wallet load succeed.Address:' + wallet.address)
            wallet.getGasPrice().then(r => console.log('gas price:' + utils.formatUnits(r, "gwei")))
            wallet.getBalance().then(num => console.log("wallet balance:" + utils.formatEther(num)))

            return wallet
        }
    }
    return wallet
}

async function mnemonicToJson(mnemonic, password) {
    const myWallet = Wallet.fromMnemonic(mnemonic)

    console.log(myWallet.address)
    let jsonStr = await myWallet.encrypt(password)
    console.log(jsonStr)
    return [myWallet.address, jsonStr]
}

export function getProp() {
    return prop
}

export function getConfig() {
    return {
        chainId: chainId,
        etherscanAPIKey: etherscanAPIKey,
        infuraAPIKey: infuraAPIKey,
        tokens: tokens,
    }

}

//加载钱包
initWallet(provider)