import sdkCore from '@uniswap/sdk-core'
import {Route, SwapRouter, Trade,} from '@uniswap/v3-sdk'
import {IERC20, SWAP_ROUTER_ADDRESS} from './constant.js'
import {
    fillTranRequest,
    getProvider,
    getSwapQuote,
    getWalletAddress,
    sendTransactionByWallet,
    TransactionState
} from './providers.js'
import {getPool} from './pool.js'
import {doubleToPersent, movePointRight} from '../util.js'
import {Contract} from 'ethers'
import assert from "assert";

const {Currency, CurrencyAmount, Token, TradeType} = sdkCore

//export type TokenTrade = Trade < Token, Token, TradeType >

/**
 * 构造交易数据
 * @param provider 区块链节点. 通常是ethers.getDefaultProvider
 * @param tokenIn {Token}
 * @param tokenOut {Token}
 * @param amountIn {number} 浮点数
 * @param needAmountOut {number} 浮点数，要求产出多少
 * @param poolFee {number} 枚举类型FeeAmount的值：500表示百万分之500，也就是0.0005，也就是0.05%；3000表示0.3%,10000表示1%
 * @param slippage {Number|string} 能容忍的滑点. 0.001表示0.1% ,这个值应该用来降低outputAmount
 * @returns {Promise<Trade<Currency, Currency, TradeType>>}
 */

export async function createTrade(provider, tokenIn, tokenOut, amountIn, needAmountOut, poolFee, slippage) {
    //这里计算outputAmount不要涉及到slippage。因为会由SwapRouter02.swapCallParameters涉及到
    let inputAmount = CurrencyAmount.fromRawAmount(tokenIn, movePointRight(amountIn, tokenIn.decimals))
    let outputAmount = CurrencyAmount.fromRawAmount(tokenOut, movePointRight(needAmountOut, tokenOut.decimals))
    let pool1 = await getPool(tokenIn, tokenOut, poolFee) //实时获取pool,因为市场剧烈波动，价格已经变了
    const swapRoute = new Route([pool1], tokenIn, tokenOut) //如果包含多个池，这些池必须有序排列、紧密衔接(也叫多跳)，例如：a/b, b/c, c/d

    //两种方式计算output.【推荐前一种，因为自己维护的pool信息可能陈旧】 这个output是否满足期望？如果不满足，就取消交易.
    //方式1：getOutputQuote
    let decimalOutAmount = await getSwapQuote(getProvider(), swapRoute, CurrencyAmount.fromRawAmount(tokenIn, movePointRight(amountIn, tokenIn.decimals)), tokenOut, TradeType.EXACT_INPUT)
    let actualSlippage = ((needAmountOut - decimalOutAmount) / needAmountOut * 100).toFixed(2) //这是个百分数，因为已经乘了100
    let info = `getOutputQuote期望滑点${slippage * 100}%，实际滑点actualSlippage=${actualSlippage}%`
    assert(actualSlippage <= slippage * 100, `实际滑点超出期望值：${info}`)
    console.info(info)


    //方式2：pool2.getOutputAmount计算出的滑点
    let poolOut = (await pool1.getOutputAmount(inputAmount))[0].toFixed()
    let actualSlippageFromPool = ((needAmountOut - poolOut) / needAmountOut * 100).toFixed(6)
    let info2 = `getOutputAmount期望滑点${slippage * 100}%，实际滑点actualSlippageFromPool=${actualSlippageFromPool}%`
    assert(actualSlippageFromPool <= slippage * 100, `实际滑点超出期望值：${info2}`)
    console.info(info2)


    //
    console.info(`inputAmount=${inputAmount.toFixed()},outputAmount=${outputAmount.toFixed()}, slippage=${slippage}`)
    //单条路由链，在不计算交换结果的情况下创建交易，这通常在你没有获取tick数据的情况下用该函数。如果有多条路由链，可以用createUncheckedTradeWithMultipleRoutes
    return Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: inputAmount,
        outputAmount: outputAmount,
        tradeType: TradeType.EXACT_INPUT,
    })


}

/**
 * 执行交易
 * @param trade {Trade<Currency, Currency, TradeType>}
 * @param slippage {Number|string} 滑点. 0.001表示0.1%
 * @param maxWaitSeconds 最多等待多少秒
 * @param gasPriceGwei{string}
 * @param recipient 货币的接收者，大多情况下不需要填写
 * @returns {Promise<{orderId, nonce, hash, events}>}
 */
export async function executeTrade(trade, slippage, maxWaitSeconds, gasPriceGwei, recipient) {
    //构造SwapOptions
    const options = {
        slippageTolerance: doubleToPersent(slippage),
        deadline: Math.floor(Date.now() / 1000) + maxWaitSeconds,
        recipient: recipient,
    }
    //提供给swapCallParameters的trade，里面包含的route内部至少要包含一个池。如果只包含一个池:a/b，那么交换会在这单个池发生(也叫单跳)(通过调用v3-periphery合约中的SwapRouter.exactInputSingle)。
    // 如果包含多个池，这些池必须有序排列、紧密衔接(也叫多跳)，例如：a/b, b/c, c/d.(通过调用v3-periphery合约中的SwapRouter.exactInput)
    const methodParameters = SwapRouter.swapCallParameters([trade], options)

    return await sendTransactionByWallet({
        ...fillTranRequest(null, methodParameters.calldata, SWAP_ROUTER_ADDRESS, methodParameters.value, recipient),
    }, maxWaitSeconds, gasPriceGwei)
}


/**
 * 授权
 * @param token{Token}
 * @param amount{number}
 * @param maxWaitSecond{number}
 * @param gasPriceGwei{string}
 * @param spenderAddress 谁可以花我的钱
 * @return {Promise<string>}
 */
export async function getTokenTransferApproval(token, amount, maxWaitSecond, gasPriceGwei, spenderAddress) {
    const provider = getProvider()
    const address = getWalletAddress()
    if (!provider || !address) {
        console.log('No Provider Found')
        return TransactionState.Failed
    }
    try {
        const tokenContract = new Contract(token.address, IERC20.abi, provider)
        const transaction = await tokenContract.approve.populateTransaction(
            spenderAddress,
            movePointRight(amount, token.decimals)
        )
        return sendTransactionByWallet({...transaction, from: address,}, maxWaitSecond, gasPriceGwei)
    } catch (e) {
        console.error(new Date().toLocaleString() + ' queryTokenBalance异常：', e.stack || e)
        return TransactionState.Failed
    }
}

