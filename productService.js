import {createOrderBook, getPool, poolMap} from './lib/pool.js'
import assert from 'assert'
import {Big, movePointRight, parseBookArgs} from './util.js'

import {Contract, formatUnits,} from 'ethers'
import {hasUniswap, myAxios, nativeToken, oneInchConf, provider, tokens} from './config.js'
import oneInchOracleAbi from './lib/oneInchOracleAbi.json' assert {type: 'json'}
import {Pool} from "@uniswap/v3-sdk";
import {uniswapV3Factory} from "./lib/constant.js";

/**
 * 查询某个交易对的市场挂单。耗时4到7秒
 * 注意：涉及到 x * y=k, x * sqrt(PriceX) =L, pool.liquidity, pool.sqrtRatioX96这些内容的，数据单位一律是聪、伟这些最小单位。
 * 如何从tehGraph获取多个tick？ https://github.com/Uniswap/v3-sdk/issues/72
 * @param coinPair {string} 交易对goods-money，例如：eth-usdc
 * @param poolFee {Number} 手续费。 500表示百万分之500，也就是0.0005，也就是0.05%
 * @return 复杂对象： {ask:[[price:string,volume:string]],bid:[[price:string,volume:string]]}
 */
export async function bookProduct(coinPair, poolFee) {
    const [goodsToken, moneyToken] = parseBookArgs(coinPair)
    let poolAddress = Pool.getAddress(goodsToken, moneyToken, poolFee, null, uniswapV3Factory)
    let poolInfo2 = poolMap[poolAddress]
    assert(poolInfo2, 'poolInfo2为空')
    if (!poolInfo2.needOrderBook) {//如果首次开启OrderBook,就需要立刻执行一遍。以后就会自动执行
        poolInfo2.needOrderBook = true
        await createOrderBook(poolInfo2.pool, poolInfo2.goodsToken, poolInfo2.moneyToken, poolInfo2.marketOrderSize, poolInfo2.r, poolInfo2.pool.fee)
    }
    return {asks: poolMap[poolAddress].asks, bids: poolMap[poolAddress].bids}
}


/**
 * 查询gas费，以及eth相对某种币的价格
 * @param moneySymbol 交易对中的计价货币
 * @param poolFee {number} 费率。500表示0.05%
 * @return {Promise<Array>}
 */
export async function getGasPriceGweiAndEthPrice(moneySymbol, poolFee) {
    let gasPrice
    moneySymbol = moneySymbol.toLowerCase()
    try {
        if (moneySymbol === nativeToken || moneySymbol === 'w' + nativeToken) {
            console.log(new Date().toLocaleString() + `: call getGasPrice 2 times`)
            gasPrice = await provider.getGasPrice()
            let gasPriceGwei = formatUnits(gasPrice, "gwei")
            return [Number(gasPriceGwei).toFixed(2), 1]

        } else {
            let ethPrice, gasPriceGwei
            const [goods, money] = ['w' + nativeToken, moneySymbol]
            let [goodsToken, moneyToken] = [tokens[goods].wrapped, tokens[money].wrapped]
            assert(goodsToken && moneyToken, "token 不存在：" + [goods, money])
            if (hasUniswap) {
                console.log(new Date().toLocaleString() + `: call getPool&getGasPrice 2 times`)
                const [pool, gasPrice] = await Promise.all([getPool(goodsToken, moneyToken, poolFee), provider.getGasPrice()])
                ethPrice = pool.priceOf(goodsToken).toFixed(9)
                gasPriceGwei = formatUnits(gasPrice, "gwei")
            } else {//没有uniswap，那么就从1inch的spot-price-aggregator预言机获取eth的价格了
                console.log(new Date().toLocaleString() + `: call 1inch oracle & getGasPrice 2 times`)
                let oneInchOracle = new Contract(oneInchConf.oracle, oneInchOracleAbi, provider)
                const [bigNumberPrice, gasPrice] = await Promise.all([oneInchOracle.getRate(goodsToken.address, moneyToken.address, false), provider.getGasPrice()])
                ethPrice = BigInt(bigNumberPrice).div(10 ** moneyToken.decimals).toString()
                gasPriceGwei = formatUnits(gasPrice, "gwei")
            }
            return [Number(gasPriceGwei).toFixed(2), ethPrice]

        }
    } catch (e) {
        console.error(new Date().toLocaleString() + ' getGasPriceGweiAndEthPrice异常：', e.stack || e)
        throw e
    }
}


/**
 * 通过1inch查询多个dex的聚合行情
 * @param coinPair goods-money
 * @param goodsAmount 货物数量，浮点数
 * @param moneyAmount 货币数量，浮点数
 * @return {Promise<{asks: string[][], bids: string[][]}>}
 */
export async function bookProductOneInch(coinPair, goodsAmount, moneyAmount) {
    try {
        const [goodsToken, moneyToken] = parseBookArgs(coinPair)

        let promiseAsks = myAxios.get('/quote', {
            params: {//我要查询的卖单，是我想买的。from是以我为参照
                fromTokenAddress: moneyToken.address,
                toTokenAddress: goodsToken.address,
                amount: movePointRight(moneyAmount, moneyToken.decimals)
            },
        })
        let promiseBids = myAxios.get('/quote', {
            params: {//我要查询的买单，是我想卖的
                fromTokenAddress: goodsToken.address,
                toTokenAddress: moneyToken.address,
                amount: movePointRight(goodsAmount, goodsToken.decimals)
            },
        })

        let responseArr = await Promise.all([promiseAsks, promiseBids])
        //asks中的元素有4个子元素：price, volume, protocols, estimatedGas
        let asks, bids

        let data = responseArr[0].data
        let goodsPrice = Big(data.fromTokenAmount).div(data.toTokenAmount).div(10 ** (moneyToken.decimals - goodsToken.decimals)).toFixed(6)
        asks = [[
            goodsPrice,
            Big(moneyAmount).div(goodsPrice).toFixed(6), // Big(data.toTokenAmount).div(goodsToken.decimals).toFixed(6),
            JSON.stringify(data.protocols),
            data.estimatedGas + ''
        ]]

        data = responseArr[1].data
        bids = [[
            Big(data.toTokenAmount).div(data.fromTokenAmount).div(10 ** (moneyToken.decimals - goodsToken.decimals)).toFixed(6),
            goodsAmount + '', // Big(data.fromTokenAmount).div(goodsToken.decimals).toFixed(6),
            JSON.stringify(data.protocols),
            data.estimatedGas + ''
        ]]

        return {asks, bids}
    } catch (e) {
        console.error(e.toJSON())
        console.error(new Date().toLocaleString() + ' bookProductOneInch()异常：', e.stack || e)
        throw e
    }
}

