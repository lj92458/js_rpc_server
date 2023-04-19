//keystore相关知识：https://www.jianshu.com/p/bc9ea0dc74ed
import SwapRouterAbi
    from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json' assert {type: 'json'}
import ISwapRouterAbi
    from '@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json' assert {type: 'json'}
import ethers from 'ethers'
import {queryTokenBalance} from './accountService.js'
import {bookProduct, getGasPriceGweiAndEthPrice} from './productService.js'
import {addOrder} from './orderService.js'
import {tokens} from "./config.js";
import {Pool,} from '@uniswap/v3-sdk'
import {uniswapV3Factory} from "./lib/constant.js";
import {getTokenTransferApproval} from "./lib/trade.js";

//const config = require('./config')
//const util = require("./util")
//const https = require('https')

// const myWallet= ethers.Wallet.fromMnemonic("")
//
//  console.log(myWallet.address)
// myWallet.encrypt("").then(r => console.log("JsonWallet:"+r))


//https://api.etherscan.io/api?module=transaction&action=getstatus&txhash=0x3b4cd40bc15ccee3f166ea92665c1992d631cc4555956bb946843bb5c9ee19cc&apikey=YourApiKeyToken
// https.get(
//     'https://api.etherscan.io/api?module=transaction&action=getstatus&txhash=0x3b4cd40bc15ccee3f166ea92665c1992d631cc4555956bb946843bb5c9ee19cc&apikey=YourApiKeyToken',
//
//     res => {
//         res.on('data', (d) => {
//             //process.stdout.write(d+'\n')
//             let result= JSON.parse(String(d))
//             console.log(result.status+","+result.result.isError+","+result.result.errDescription)
//         })
//     }
// ).on('error', e => console.error(e))

//授权
function approval(symbol1, symbol2) {
    getTokenTransferApproval(tokens[symbol1], 1000000, 30, 25).then(obj => console.log(obj))
    if (symbol2) getTokenTransferApproval(tokens[symbol2], 1000000, 30, 25).then(obj => console.log(obj))
}
//approval('cusd', )

async function test1(){
let balanceArr = await queryTokenBalance('0x8E24feb043c963BD16e1B503e2b1fe21426221f5', ['eth', 'usdc'])
console.log(balanceArr)
let gasQueryArr = await getGasPriceGweiAndEthPrice('usdt', 500)
console.log(gasQueryArr)
let begin= new Date().getTime()
let {asks, bids} = await bookProduct('wbtc-usdt', 100, 0.004, 3000)
console.log(`bookProduct耗时${new Date().getTime()-begin}毫秒`)
//console.log(JSON.stringify(asks))
//console.log("=======================")
//console.log(JSON.stringify(bids))
}

async function test2() {
    await addOrder('celo-cusd', 'sell', '0.6', 3000, 30, 25, 0.001, 3000);
}

test2()

