import assert from 'assert'
import {tokens, provider, wallet} from './config.js'
import {createTrade, executeTrade} from './lib/trade.js'

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

//todo config.initWallet(config.provider)


/**
 * 提交一个订单，仅用于uniswap V3
 * @param coinPair {string} 格式：goods-money
 * @param orderType {string} 取值：buy,sell
 * @param price {Number}
 * @param volume {Number}
 * @param maxWaitSeconds
 * @param gasPriceGwei
 * @param slippage {Number|string} 滑点. 0.001表示0.1%
 * @param poolFee {number} 枚举类型FeeAmount的值：500表示百万分之500，也就是0.0005，也就是0.05%; 3000表示0.3%,10000表示1%
 * @returns {Promise<{orderId, nonce, hash}>}
 */
export async function addOrder(coinPair, orderType, price, volume, maxWaitSeconds, gasPriceGwei, slippage, poolFee) {
    try {
        const [goods, money] = coinPair.toLowerCase().split("-")
        const [goodsToken, moneyToken] = [tokens[goods].wrapped, tokens[money].wrapped]
        assert(goodsToken && moneyToken, "token 不存在：" + [goods, money])
        const [tokenIn, tokenOut] = orderType === "buy" ? [moneyToken, goodsToken] : [goodsToken, moneyToken]
        const [amountIn, amountOut] = orderType === "buy" ? [price * volume, volume] : [volume, price * volume]

        let trade = await createTrade(provider, tokenIn, tokenOut, amountIn, amountOut, poolFee, slippage)
        return executeTrade(trade, slippage, maxWaitSeconds, gasPriceGwei, wallet.address)
    } catch (e) {
        console.error('addOrder异常：', e.stack || e)
        throw e
    }
}



