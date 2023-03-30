import {Currency, CurrencyAmount, Token, TradeType} from '@uniswap/sdk-core'
import {Route, SwapQuoter, SwapRouter, Trade,} from '@uniswap/v3-sdk'
import {MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS, QUOTER_CONTRACT_ADDRESS, SWAP_ROUTER_ADDRESS,} from './constant'
import {getProvider, sendTransactionByWallet} from './providers'
import {getPool} from "./pool";
import assert from 'assert'

const util = require("../util")

const ethers = require('ethers')

//export type TokenTrade = Trade < Token, Token, TradeType >

/**
 * 构造交易数据
 * @param provider 区块链节点. 通常是ethers.getDefaultProvider
 * @param tokenIn {Token}
 * @param tokenOut {Token}
 * @param amountIn {number} 浮点数
 * @param needAmountOut {number} 浮点数，要求产出多少
 * @param poolFee {number} 枚举类型FeeAmount的值：500表示百万分之500，也就是0.0005，也就是0.05%；3000表示0.3%,10000表示1%
 * @param slippage {double|string} 能容忍的滑点. 0.001表示0.1%
 * @returns {Promise<Trade<Currency, Currency, TradeType>>}
 */

export async function createTrade(provider, tokenIn, tokenOut, amountIn, needAmountOut, poolFee, slippage) {
    const pool = await getPool(provider, tokenIn, tokenOut, poolFee)
    const swapRoute = new Route([pool], tokenIn, tokenOut)
    //大整数，单位是聪、伟等最小货币单元
    const outputQuote = await getOutputQuote(getProvider(), swapRoute, tokenIn, amountIn)
    //这个outputQuote是否满足期望？如果不满足，就取消交易
    let decimalOutAmount = ethers.formatUnits(outputQuote, tokenOut.decimals)
    let actualSlippage = ((needAmountOut - decimalOutAmount) / needAmountOut * 100).toFixed(2) //这是个百分数，因为已经乘了100
    let info = `期望滑点${slippage * 100}%，实际滑点${actualSlippage}%`
    assert(actualSlippage <= slippage * 100, `实际滑点超出期望值：${info}`)
    console.info(info)
    return Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: CurrencyAmount.fromRawAmount(tokenIn, ethers.parseUnits(amountIn.toString(), tokenIn.decimals).toString()),
        outputAmount: CurrencyAmount.fromRawAmount(tokenOut, ethers.parseUnits(needAmountOut.toString(), tokenOut.decimals).toString()),
        tradeType: TradeType.EXACT_INPUT,
    })


}

/**
 * 执行交易
 * @param trade {Trade<Currency, Currency, TradeType>}
 * @param slippage {double|string} 滑点. 0.001表示0.1%
 * @param maxWaitSeconds 最多等待多少秒
 * @param gasPriceGwei
 * @param recipient 货币的接收者
 * @returns {Promise<TransactionState.Failed|*>}
 */
export async function executeTrade(trade, slippage, maxWaitSeconds, gasPriceGwei, recipient) {
    //构造SwapOptions
    const options = {
        slippageTolerance: util.doubleToPersent(slippage),
        deadline: Math.floor(Date.now() / 1000) + maxWaitSeconds,
        recipient: recipient,
    }
    //提供给swapCallParameters的trade，里面包含的route内部至少要包含一个池。如果只包含一个池:a/b，那么交换会在这单个池发生(也叫单跳)(通过调用v3-periphery合约中的SwapRouter.exactInputSingle)。
    // 如果包含多个池，这些池之间必须能连接起来(也叫多跳)例如：a/b, b/c, c/d.(通过调用v3-periphery合约中的SwapRouter.exactInput)
    const methodParameters = SwapRouter.swapCallParameters([trade], options)
    const tx = {
        data: methodParameters.calldata,
        to: SWAP_ROUTER_ADDRESS,
        value: methodParameters.value,
        from: recipient,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    }

    return await sendTransactionByWallet(tx, maxWaitSeconds, gasPriceGwei)
}

/**
 * 给定输入的币数，查询能换得的币数(单位是聪或伟)。这是预计算，不是在链上执行的，因此不会消耗gas
 * @param provider 区块链访问入口
 * @param route {Route<Currency, Currency>} route里面包含的pool数量如果刚好是1，就会在这单个池完成交易。否则就说明有多个池共同完成交易。
 * @param tokenIn {Token}
 * @param amountIn {number} 浮点数
 * @returns {Promise<string>} 大整数，单位是聪、伟等等
 */

async function getOutputQuote(provider, route, tokenIn, amountIn) {
    const {calldata} = await SwapQuoter.quoteCallParameters(
        route,
        CurrencyAmount.fromRawAmount(tokenIn, ethers.parseUnits(amountIn.toString(), tokenIn.decimals).toString()),
        TradeType.EXACT_INPUT,
        {
            useQuoterV2: true,
        })
    //call就是只读的，或者说不会消耗gas
    const quoteCallReturnData = await provider.call({to: QUOTER_CONTRACT_ADDRESS, data: calldata,})
    return ethers.AbiCoder.defaultAbiCoder.decode(['uint256'], quoteCallReturnData)
}

