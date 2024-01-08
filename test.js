//keystore相关知识：https://www.jianshu.com/p/bc9ea0dc74ed
import SwapRouterAbi
    from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json' assert {type: 'json'}
import ISwapRouterAbi
    from '@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json' assert {type: 'json'}
import ethers, {Contract, utils} from 'ethers'
import {queryTokenBalance, sendToken, receiveToken, helpSendToken} from './accountService.js'
import {bookProduct, getGasPriceGweiAndEthPrice, bookProductOneInch} from './productService.js'
import {addOrder, addOrderOneInch} from './orderService.js'
import {chainId, nativeToken, provider, tokens, wallet} from "./config.js";
import {Pool,} from '@uniswap/v3-sdk'
import {
    AggregationRouterV5, IERC20,
    smartContractWalletAddress,
    SWAP_ROUTER_ADDRESS,
    uniswapV3Factory, weth9ABI
} from "./lib/constant.js";
import {getTokenTransferApproval} from "./lib/trade.js";
import {getActiveOrders, getOrderBookFusion, addOrderFusion} from "./lib/oneInchFusion.js";
import {movePointRight, Big} from "./util.js";
import {fillTranRequest, sendTransactionByWallet} from "./lib/providers.js";

//const config = require('./config')
//const util = require("./util")
//const https = require('https')
function createWallet(word, p) {
    const myWallet = ethers.Wallet.fromMnemonic(word)
    console.log(myWallet.address)
    myWallet.encrypt(p).then(r => console.log(r))
}


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
async function approval(symbol1, symbol2, spenderAddress = SWAP_ROUTER_ADDRESS) {
    if (symbol1) {
        let result = await getTokenTransferApproval(tokens[symbol1], 10000000, 120, Number(utils.formatUnits(await provider.getGasPrice(), "gwei")).toFixed(2), spenderAddress)
        console.log(result)
    }
    if (symbol2) {
        let result = await getTokenTransferApproval(tokens[symbol2], 10000000, 120, Number(utils.formatUnits(await provider.getGasPrice(), "gwei")).toFixed(2), spenderAddress)
        console.log(result)
    }
}

async function testSendToken() {
    let result = await sendToken(
        "eth",
        "0x0e7a26909abecd20de80f849b41d692d40abe773",
        0.001,
        true,
        20,
        utils.formatUnits(await provider.getGasPrice(), "gwei")
    )
    console.log('sendToken: ' + JSON.stringify(result))
}

async function testReceiveToken() {
    await receiveToken(
        "eth",
        "txId",
        0.001,
        true,
        20,
        utils.formatUnits(await provider.getGasPrice(), "gwei")
    )
}

async function uniswapBook() {
    let balanceArr = await queryTokenBalance(smartContractWalletAddress, ['weth', 'usdc'])
    console.log(balanceArr)
    let gasQueryArr = await getGasPriceGweiAndEthPrice('usdc', 500)
    console.log(gasQueryArr)
    let begin = new Date().getTime()
    let book = await bookProduct('weth-usdc', 100, 0.0007, 500)
    console.log(`uniswapBook耗时${new Date().getTime() - begin}毫秒`)
    console.log(JSON.stringify(book.asks))
    console.log("=======================")
    console.log(JSON.stringify(book.bids) + '\n')
    return book
}

async function oneInchAggregationBook() {
    let begin = new Date().getTime()
    let book = await bookProductOneInch('weth-usdc', 0.001, 10)
    console.log(`oneInchAggregationBook耗时${new Date().getTime() - begin}毫秒`)
    console.log(JSON.stringify(book.asks))
    console.log("=======================")
    console.log(JSON.stringify(book.bids) + '\n')
    return book
}

async function uniswapAddOrder() {
    uniswapBook().then(async book => {
        await addOrder('weth-usdc',
            'sell',
            book.bids[0][0],
            0.01,
            120,
            Number(utils.formatUnits(await provider.getGasPrice(), "gwei")).toFixed(2),
            0.001,
            500);
        await addOrder('weth-usdc',
            'buy',
            book.asks[0][0],
            0.01,
            120,
            Number(utils.formatUnits(await provider.getGasPrice(), "gwei")).toFixed(2),
            0.001,
            500);
    })

}


function test3() {
    const iface = new ethers.utils.Interface(SwapRouterAbi.abi);
    let decodedData = iface.parseTransaction({
        data: '0x414bf389000000000000000000000000471ece3750da237f93b8e339c536989b8978a438000000000000000000000000765de816845861e75a25fca122bb6898b8b1282a0000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000b0d1435590b4f14a5f4414f93489945546162ffc00000000000000000000000000000000000000000000000000000000643f82f00000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000008517fab5d6dcf680000000000000000000000000000000000000000000000000000000000000000',
        value: '0x00'
    });
    console.log(decodedData)
}

async function oneInchAggregationAddOrder() {
    oneInchAggregationBook().then(async book => {
        await addOrderOneInch('weth-usdc',
            'sell',
            book.bids[0][0],
            0.01,
            120,
            Number(utils.formatUnits(await provider.getGasPrice(), "gwei")).toFixed(2),
            0.002);
        await addOrderOneInch('weth-usdc',
            'buy',
            book.asks[0][0],
            0.01,
            120,
            Number(utils.formatUnits(await provider.getGasPrice(), "gwei")).toFixed(2),
            0.002);
    })
}

async function oneInchFusionBook() {
    let orders = await getActiveOrders(1, 10)
    console.log('oneInchFusion ActiveOrders: ' + JSON.stringify(orders))
    let book = await getOrderBookFusion('weth-usdc', 0.001, 10)
    console.log('oneInchFusionBook: ' + JSON.stringify(book) + '\n')
    return book
}

async function oneInchFusionAddOrder() {
    oneInchFusionBook().then(async book => {
            //sell
            let addOrderResult = await addOrderFusion('weth-usdc',
                'sell',
                book.bids[0][0],
                0.01,
                null,
                null,
                null)
            console.log("addOrderFusion sell" + JSON.stringify(addOrderResult))
            //buy
            addOrderResult = await addOrderFusion('weth-usdc',
                'buy',
                book.asks[0][0],
                0.01,
                null,
                null,
                null)
            console.log("addOrderFusion buy" + JSON.stringify(addOrderResult))
        }
    )
}

async function wethWrap(isWrap, amount, tokenAddress) {
    let contractWeth9 = new Contract(tokenAddress, weth9ABI.abi, provider)
    if (isWrap) {//eth转weth(调用deposit)
        const transaction = await contractWeth9.populateTransaction.deposit()
        await sendTransactionByWallet({...fillTranRequest(transaction, null, null, movePointRight(amount, 18)),}, 30, 0.1)
    } else {//weth转成eth(调用widthdraw)
        const transaction = await contractWeth9.populateTransaction.widthdraw(movePointRight(amount, 18));
        await sendTransactionByWallet({...fillTranRequest(transaction),}, 30, 0.1);
    }
}

async function testHelpSendToken(symbol, amount) {
    let tokenObj = tokens[symbol]?.wrapped || tokens['w' + symbol]?.wrapped
    let contractERC20 = new Contract(tokenObj.address, IERC20.abi, provider)
    await helpSendToken(null, '0x0e7a26909abecd20de80f849b41d692d40abe773', amount, 18, 30, 0.1)
}

//createWallet('','')
//await approval('weth', 'usdc', SWAP_ROUTER_ADDRESS).then() // SWAP_ROUTER_ADDRESS 或者 1inch的AggregationRouterV5
//await uniswapBook()
//await testSendToken().then()
//await oneInchAggregationBook()
//await oneInchFusionBook()
//await oneInchAggregationAddOrder().then()
//await oneInchFusionAddOrder()
await wethWrap(true, 12.394843, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1')
//await testHelpSendToken('weth', 0.103749)