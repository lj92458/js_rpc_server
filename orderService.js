import {myAxios, provider, smartContractWallet, useSmartContractWallet, wallet} from './config.js'
import {createTrade, executeTrade} from './lib/trade.js'
import {movePointRight, parseAddOrderArgs} from "./util.js";
import {fillTranRequest, sendTransactionByWallet} from "./lib/providers.js";
import {smartContractWalletAddress} from "./lib/constant.js";

/* ethers.org使用手册：Contract对象
调用某个智能合约，直接用address和abi构造Contractd对象。 这个对象的特性，请参考：
https://docs.ethers.org/v5/single-page/#/v5/api/contract/contract/-%23-Contract--metaclass
调用智能合约的函数，如果改变了区块链状态(需要gas)，那么该函数无法返回结果(返回的是Promise<TransactionResponse>)，
只能被Solidity event或EVM log记录日志。日志可以从transactionReceipt对象查到.
分析某个函数的特性，(例如估算gas消耗)contract.estimateGas.METHOD_NAME 参考：https://docs.ethers.org/v5/single-page/#/v5/api/contract/contract/-%23-Contract--check
*/

//===============================================================

/*  ethers.org使用手册：provider对象
估算gas价格
gasPrice = await provider.getGasPrice() // { BigNumber: "57000000000" }
utils.formatUnits(gasPrice, "gwei") // '57.0'
估算gas量
provider.estimateGas( transaction )
 读区块链
 provider.call()
 写区块链，返回TransactionResponse（它继承了transaction）
 wallet.sendTransaction( transaction ) ⇒ Promise< TransactionResponse >
 等待这个交易被打包  https://docs.ethers.org/v5/single-page/#/v5/api/providers/types/-%23-providers-TransactionResponse
 TransactionResponse.wait( [ confirmations = 1 ] ) ⇒ Promise< TransactionReceipt >
 等待某个交易TransactionResponse.hash 被打包
provider.waitForTransaction( hash [ , confirms = 1 [ , timeout ] ] )

r/s/v参数：分别代表椭圆曲线签名的三个部分： transaction.r transaction.s transaction.v
 */

//const paramSet = {}//去重，防止addOrder方法被莫名奇妙的重复调用
//const defaultSlipage = util.doubleToPersent(config.slippage)

// config.initWallet(config.provider)


/**
 * 提交一个订单，仅用于uniswap V3
 * @param coinPair {string} 格式：goods-money
 * @param orderType {string} 取值：buy,sell
 * @param price {Number}
 * @param volume {Number}
 * @param maxWaitSeconds
 * @param gasPriceGwei{string}
 * @param slippage {Number|string} 滑点. 0.001表示0.1%
 * @param poolFee {number} 枚举类型FeeAmount的值：500表示百万分之500，也就是0.0005，也就是0.05%; 3000表示0.3%,10000表示1%
 * @returns {Promise<{orderId, nonce, hash}>}
 */
export async function addOrder(coinPair, orderType, price, volume, maxWaitSeconds, gasPriceGwei, slippage, poolFee) {
    console.log('addOrder: ' + JSON.stringify(arguments))
    try {
        if (slippage < 0) {
            slippage = 0.005
        }
        let priceAdjusted = orderType === 'buy' ? price * (1 + slippage) : price * (1 - slippage)
        const [tokenIn, tokenOut, amountIn, amountOut] = parseAddOrderArgs(coinPair, orderType, priceAdjusted, volume);
        let trade = await createTrade(provider, tokenIn, tokenOut, amountIn, amountOut, poolFee, slippage)
        return await executeTrade(trade, slippage, maxWaitSeconds, gasPriceGwei + '', useSmartContractWallet ? smartContractWalletAddress : wallet.address)
    } catch (e) {
        console.error(new Date().toLocaleString() + ' addOrder异常：', e.stack || e)
        throw e
    }
}

/**
 * 1inch聚合交易。AggregationRouterV5合约arb地址：0x1111111254eeb25477b68fb85ed929f73a960582
 * 文档：https://docs.1inch.io/docs/aggregation-protocol/api/swap-params/
 * @param coinPair
 * @param orderType
 * @param price
 * @param volume
 * @param maxWaitSeconds
 * @param gasPriceGwei
 * @param slippage
 * @return {Promise<{orderId, nonce, hash}>}
 */
export async function addOrderOneInch(coinPair, orderType, price, volume, maxWaitSeconds, gasPriceGwei, slippage) {
    console.log('addOrderOneInch: ' + JSON.stringify(arguments))
    try {
        let transaction = getTx(coinPair, orderType, price, volume, slippage)
        console.log('addOrderOneInch预计消耗gas量:' + transaction.gas)
        return await sendTransactionByWallet({
            ...fillTranRequest(transaction, null, null, null, null),
        }, maxWaitSeconds, gasPriceGwei)
        //

    } catch (e) {
        console.error(e.toJSON())
        console.error(new Date().toLocaleString() + ' addOrderOneInch异常：', e.stack || e)
        throw e
    }
}

/**
 * 提交两个oneInch订单，在同一个evm调用堆栈中完成。或者叫同一个事务。
 * @param coinPair1
 * @param orderType1
 * @param price1
 * @param volume1
 * @param maxWaitSeconds1
 * @param gasPriceGwei1
 * @param slippage1
 * @param coinPair2
 * @param orderType2
 * @param price2
 * @param volume2
 * @param maxWaitSeconds2
 * @param gasPriceGwei2
 * @param slippage2
 * @return {Promise<{orderId, nonce, hash}>}
 */
export async function addTwoOrderOneInch(coinPair1, orderType1, price1, volume1, maxWaitSeconds1, gasPriceGwei1, slippage1,
                                         coinPair2, orderType2, price2, volume2, maxWaitSeconds2, gasPriceGwei2, slippage2) {
    console.log('addTwoOrderOneInch: ' + JSON.stringify(arguments))
    try {
        let [transaction1, transaction2] = await Promise.all([
            getTx(coinPair1, orderType1, price1, volume1, slippage1),
            getTx(coinPair2, orderType2, price2, volume2, slippage2)
        ])
        console.log('addTwoOrderOneInch预计消耗gas量:' + transaction1.gas + ', 和' + transaction1.gas)

        let transaction = await smartContractWallet.populateTransaction.aggregate3Value([
                {target: transaction1.to, allowFailure: false, value: transaction1.value, callData: transaction1.data},
                {target: transaction2.to, allowFailure: false, value: transaction2.value, callData: transaction2.data},
            ], {value: transaction1.value + transaction2.value,}
        )

        //调用自己编写的合约
        return await sendTransactionByWallet({
            ...fillTranRequest(transaction, null, null, null, null),
        }, maxWaitSeconds1, gasPriceGwei1)
    } catch (e) {
        console.error(e.toJSON())
        console.error(new Date().toLocaleString() + ' addOrderOneInch异常：', e.stack || e)
        throw e
    }
}

/**
 * 调用oneInch的swap接口，获得要提交的transaction
 * @param coinPair
 * @param orderType
 * @param price
 * @param volume
 * @param slippage
 * @return {Promise<{from,to,data,value,gasPrice,gas}>}
 */
async function getTx(coinPair, orderType, price, volume, slippage) {
    const [tokenIn, tokenOut, amountIn, amountOut] = parseAddOrderArgs(coinPair, orderType, price, volume);
    //构造transaction，供ethers调用
    let response = await myAxios.get('/swap', {
        params: {//fromTokenAddress是我要付出的币
            fromTokenAddress: tokenIn.address,
            toTokenAddress: tokenOut.address,
            amount: movePointRight(amountIn, tokenIn.decimals),
            fromAddress: useSmartContractWallet ? smartContractWalletAddress : wallet.address,
            slippage: (slippage * 100),
            disableEstimate: false,
        },
    })
    return response.data.tx
}



