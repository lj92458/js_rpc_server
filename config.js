/**
 * @uniswap/v3-sdk 用于在uniswap-v3上构建程序的sdk.
 * @uniswap/v3-periphery 对uniswap内核的高度封装.
 * @uniswap/v3-core   uniswap内核.
 * @uniswap/sdk-core 对其它sdk数据结构的抽象，用于多个sdk之间共享数据结构、互相传递数据
 */
import {Environment, tokens as allTokens} from './lib/constant.js'
import {getDefaultProvider, providers, utils, Wallet} from 'ethers'
import {prop} from './properties.js'
import {ScanProvider} from './lib/ScanProvider.js'

export const nativeToken = 'eth' //不同的链，有不同的代币。一定要小写
export const minNativeToken = 0.001 //当eth数量少于minNativeToken时，自动从weth转换maxNativeToken过来，以支付gas费
export const maxNativeToken = 0.05
//是否支持weth10，如果支持，就能调用withdrawTo、depositTo，否则只有withdraw、deposit。目前只发现arbitrum支持weth10，而celo既是native又是erc20，因此它不需要deposit方法。
export const supportWeth10 = false //就算支持weth10又怎么样呢？ 交易平台的充值，不支持通过调用合约函数。否则无法到账，要申诉，被人工处理。需要两天处理完
export const whiteList = [//注意安全，从钱包提币，只能提到指定的白名单里。
    //全部小写
    '0x7b74755c1252804eaa265003c0a9e745c792d68f',//她的币安eth系
    '0x6803c2566b114196e56949999b4bbbee413777f0',//我的币安eth系
    '0x0e7a26909abecd20de80f849b41d692d40abe773',//我的okx
]
export const rpc = {
    local: 'http://localhost:8545',
    net1: '',
    net2: '',
    net3: ''
}
export const chainId = Number(process.argv.slice(2)[1]) || 1 //网络编号，由启动参数传来。
export const env = process.argv.slice(2)[2] || 'MAINNET' //当前环境LOCAL, MAINNET, WALLET_EXTENSION
export let tokens = allTokens[chainId] || null
export const etherscanAPIKey = '32YQ9W1FDCU1XGCUNQQF9Z5GG6R5B2BYNI' //https://api.arbiscan.io/api

export let provider
(function createProvider() {
    //如果是本机客户端
    if (env === Environment.LOCAL) {
        provider = new providers.JsonRpcProvider(rpc.local)
    } else if (env === Environment.MAINNET) {//如果是远程公共服务
        //ankr，pocket，infura都支持arbitrum
        provider = new ScanProvider(chainId, etherscanAPIKey) //arbitrumscan有时候卡。但是免费计划，能允许每秒五次调用呢。如果每3秒执行一次，每小时就是10600次，平均每秒2.9次
        //还是卡，需要美元50美元才不卡.50美元能确保每天20万次调用(每小时八千次)。免费的每天10能调用万次(4166次每小时)。我的程序如果每3秒执行一次，每小时就是10600次。即使调到6秒每次，也不够用(要交50$).只能用美元支付
        //provider = new JsonRpcProvider('https://arbitrum-mainnet.infura.io/v3/da153625e5c247319b62d4b5a76fc639', chainId)
        //我的程序如果每3秒执行一次，每小时就是10600次,每个月763万次。根据https://www.ankr.com/docs/rpc-service/pricing 的价格列表，每次0.00002$,每月就是152$ 。如果6秒一次，就是76$。只能用美元支付。这是eth链的价格，其它链减半
        //provider = new providers.JsonRpcProvider('https://rpc.ankr.com/arbitrum/a769c35667e8f23271dd8ae9d396d9949d2b4c59b518932331b6aa947195a174', chainId)
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


const jsonWallet = `{"address":"b0d1435590b4f14a5f4414f93489945546162ffc","id":"c0bbf106-dc26-4f0d-a874-bd02c201ac52","version":3,"crypto":{"cipher":"aes-128-ctr","cipherparams":{"iv":"5899508f17f0ffb191e14bc726804ef0"},"ciphertext":"c8720835016b45803f1c8f6e8b8f561b9cc39f4c5bd21c1e724191b208fe124d","kdf":"scrypt","kdfparams":{"salt":"5296251e5acbc8f9c2ca7c30d2803fdc51613e05501d4f651764786d2e5585d2","n":131072,"dklen":32,"p":1,"r":8},"mac":"04a4a74a63a0ebf16d4d7ecc570f815c1009eb937aaa99753f9b4a8f3dcf707a"},"x-ethers":{"client":"ethers.js","gethFilename":"UTC--2023-04-17T22-57-40.0Z--b0d1435590b4f14a5f4414f93489945546162ffc","mnemonicCounter":"5188331e1f573e599fce629394bcbd0d","mnemonicCiphertext":"c8cf9da637eadfdfeec21c958b0dc90b","path":"m/44'/60'/0'/0/0","locale":"en","version":"0.1"}}`
export let wallet = null
export const serverUri = "http://0.0.0.0:8093"
//export const slippage = "0.002"//允许的滑点。当远程调用没有传来滑点时，才采用默认的滑点


export const dbPath = '/var/js_rpc_server_arbitrum/sqlite3.db'

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