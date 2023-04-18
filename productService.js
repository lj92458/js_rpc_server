import {creatPoolWithticksFromPool, getPool} from './lib/pool.js'
import assert from 'assert'
import {CurrencyAmount, Price, Token} from '@uniswap/sdk-core'
import {getTokenAmount, poolFeeToNumber} from './util.js'
import {Pool} from '@uniswap/v3-sdk'
import {utils} from 'ethers'
import {nativeToken, provider, tokens} from './config.js'

/**
 * 查询某个交易对的市场挂单。耗时4到7秒
 * 注意：涉及到 x * y=k, x * sqrt(PriceX) =L, pool.liquidity, pool.sqrtRatioX96这些内容的，数据单位一律是聪、伟这些最小单位。
 * 如何从tehGraph获取多个tick？ https://github.com/Uniswap/v3-sdk/issues/72
 * @param coinPair {string} 交易对goods-money，例如：eth-usdc
 * @param marketOrderSize{Number} 返回的订单数量
 * @param orderStepRatio {Number} 一串小数。两个相邻的挂单之间价格差距比例是多少？建议为价格的万分之一/万分之二，但是uniswap要求必须大于手续费(手续费是万五，或万三十)
 * @param poolFee {Number} 手续费。 500表示百万分之500，也就是0.0005，也就是0.05%
 * @return 复杂对象： {ask:[[price:string,volume:string]],bid:[[price:string,volume:string]]}
 */
export async function bookProduct(coinPair, marketOrderSize, orderStepRatio, poolFee) {

    const [goods, money] = coinPair.toLowerCase().split("-")
    const [goodsToken, moneyToken] = [tokens[goods].wrapped, tokens[money].wrapped]
    assert(goodsToken && moneyToken, "token 不存在：" + [goods, money])
    let pool = await getPool(provider, goodsToken, moneyToken, poolFee)
    /*在调用pool.getOutputAmount函数之前，要确保pool里面有充足的tick可被访问。
      如果挂单价格递增0.1%， 100个挂单会引起10.5%的价格波动。如果挂单价格递增0.3%，100个挂单会引起35%的价格波动。如果r=f+ 0.2% = 0.5%,一百个挂单会引起65%的价格波动 . 所以我们最多处理65%的价格波动就行。
      那么65%的价格波动，涉及到多少个tick呢？解方程1.0001**n = 1.65，得n=log1.0001(1.65)= log(1.65)/log(1.0001)= 4984.
      TickLen.getPopulatedTicksInWord函数，一次最多能返回一个字节(256个)的“被填充过的有效tick”(只返回被填充过的，而不是全部有效tick。有效tick是指tickNumber % TICK_SPACING =0的)。那么：
      当FeeAmount=100时，费率=0.01%，TICK_SPACING=1，对该函数调用18.8次就能返回4984个有效tick.
      当FeeAmount=500时，费率=0.05%，TICK_SPACING=10，对该函数调用1.88次就能返回498.4个有效tick(涉及4984个).
      当FeeAmount=3000时，费率=0.3%，TICK_SPACING=60，对该函数调用0.133次就能返回83个有效tick(涉及4984个).
      当FeeAmount=10000时，费率=1%，TICK_SPACING=200，对该函数调用0.094次就能返回25个有效tick(涉及4984个).
      因为我们不会使用0.01%费率的池子，也就不会出现TICK_SPACING=1的情况。所以除了获取当前字节，还要获取左边2字节和右边2字节。
    */
    let bids, asks;
    try {
        pool = await creatPoolWithticksFromPool(pool, poolFee === 500 ? 2 : 1)

        //用卖的办法(输入goods)，模拟出市场买单。然后我可以提交卖单吃掉这些市场买单。
        bids = await createMarketOrder(pool, goodsToken, moneyToken, marketOrderSize, orderStepRatio, goodsToken, poolFee)
        //用买的办法(输入money)，模拟出市场卖单。然后我可以提交买单吃掉这些市场卖单。
        asks = await createMarketOrder(pool, moneyToken, goodsToken, marketOrderSize, orderStepRatio, goodsToken, poolFee)
    } catch (e) {
        console.error('bookProduct异常：', e.stack || e)
        throw e
    }
    //console.log(bids)//todo 注释掉这里的日志
    //console.log("=======================")
    //console.log(asks)//todo 注释掉这里的日志
    return {asks, bids}
}

/**
 * 辅助方法。利用v2的恒定乘积原理，生成市场挂单。
 * 注意：涉及到 x * y=k, x * sqrt(PriceX) =L, pool.liquidity, pool.sqrtRatioX96这些内容的，数据单位一律是聪、伟这些最小单位。
 * @param pool {Pool}
 * @param inputToken {Token}
 * @param outputToken {Token}
 * @param marketOrderSize
 * @param r {Number} 价格下降比例。也就是orderStepRatio.
 * @param goodsToken {Token}
 * @param poolFee {Number} 整数表示的费率。 500表示百万分之500，也就是0.0005，也就是0.05%.
 * @return orderArr {[[string,string]]}
 */

async function createMarketOrder(pool, inputToken, outputToken, marketOrderSize, r, goodsToken, poolFee) {
    //模拟生成市场挂单
    /*
    设池中有xy两种币。用a量的x能换来b量的y。请问b是多少(a和b的单位是聪或者伟)？答：如果没有手续费，就是b=ay/(a+x) ; 如果有手续费f,就是b=(1-f)ay/(x+(1-f)a)
    用x币换y币，会导致x的价格下降。请问用多少x换y，才能导致x的执行价下降比例是r？也就是给定r，求a(单位是聪或者伟). 备注：x的初始价p0= y/x,  x的执行价p1= b/a= (1-f)y/(x+(1-f)a)，执行后的价格p2= (y-b)/(a+x)= y/(x+a) - ay/(a+x)^2
    【注意：计算出来的a，只是能保证当前价跟执行价之间的关系是r，不能保证这个执行价，跟下一个执行价之间的关系还是r。但是各个执行价之间的差距，没必要都是r,所以就用本次计算出来的a作为每次的inputAmount.
    因为双曲线斜率越来越小，所以这会导致r越来越小。要想r恒定，则a需要越来越大】
    答案：由r= 1- p1/p0，得出 a= x[1/(1-r) - 1/(1-f)].  因为a>0 ,所以r>f
     */
    //计算输入的x币的数量a (a是Big类型,单位是聪或者伟。)
    let f = poolFeeToNumber(poolFee)
    assert(r > f, 'r必须大于手续费f. a= x/(1-r) - x/(1-f).  因为a>0 ,所以r>f')

    let outputAmountArr = []
    let inputAmountArr = []
    for (let i = 0, tmpPool = pool; i < marketOrderSize; i++) {
        let inputAmount = getInputAmount(tmpPool, inputToken, r, f)
        ;[outputAmountArr[i], tmpPool] = await tmpPool.getOutputAmount(inputAmount)
        inputAmountArr[i] = inputAmount
    }
    //开始计算市场挂单
    let orderArr = [] //存储模拟出来的市场挂单
    let isSell = goodsToken.equals(inputToken)//如果是用商品换钱（卖单）
    for (let i in outputAmountArr) {
        let [goodsAmount, moneyAmount] = isSell ? [inputAmountArr[i], outputAmountArr[i]] : [outputAmountArr[i], inputAmountArr[i]]
        /*
        Price的构造函数需要依次传入TBase,TQuote.也就是基准货币(goods)、报价货币(money)。price = money/goods,
        输入goods来试着获取money时，相当于在查询市场上的买单，收取手续费会导致money减小，也就是price减小。通过压低买单价格，来体现出手续费。
        输入money来试着获取goods时，相当于在查询市场上的卖单，收取手续费会导致goods减小，也就是price变大。通过抬高卖单价格，来体现出手续费。
         */
        let price = new Price({baseAmount: goodsAmount, quoteAmount: moneyAmount}).toFixed(9)
        let amount = goodsAmount.toFixed(goodsAmount.currency.decimals)
        /*
        请在测试时验证下列猜想(在流动性不波动的情况下)：
        1.如果每次用相同的inputAmount
        1.1用卖的办法，模拟出市场买单，会发现市场买单具有相同地挂单量，价格逐渐降低(降得越来越慢)。
        1.2用买的办法，模拟出市场卖单，会发现市场卖单具有相同的资金量，价格逐渐升高(升得越来越快)、挂单量逐渐降低。
        2.如果每次用不同的inputAmount
        2.1用卖的办法，模拟出市场买单，会发现价格逐渐降低(下降幅度总是r)。
        2.2用买的办法，模拟出市场卖单，会发现价格逐渐升高(升高幅度总是r)、挂单量逐渐降低。
        */
        orderArr.push([price, amount])
    }
    return orderArr
}

/**
 * 辅助createMarketOrder方法，计算inputAmount
 * @param pool {Pool}
 * @param inputToken {Token}
 * @param r {Number} 价格下降比例
 * @param f {Number} 手续费费率
 * @return {CurrencyAmount<*>} inputAmount
 */
function getInputAmount(pool, inputToken, r, f) {
    //x币的总数量(Big类型，单位是聪、伟等最小单元)
    let inputTokenTotalRawAmount = getTokenAmount(pool.liquidity, pool.sqrtRatioX96, pool.token0.equals(inputToken))
    //a是Big类型,单位是聪或者伟等最小单元
    const bigA = inputTokenTotalRawAmount.times(1 / (1 - r) - 1 / (1 - f))
    return CurrencyAmount.fromRawAmount(inputToken, bigA.toFixed(0))
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
        if (moneySymbol === nativeToken) {
            gasPrice = await provider.getGasPrice()
            let gasPriceGwei = utils.formatUnits(gasPrice, "gwei")
            return [Number(gasPriceGwei).toFixed(2), 1]

        } else {
            const [goods, money] = [nativeToken, moneySymbol]
            let [goodsToken, moneyToken] = [tokens[goods].wrapped, tokens[money].wrapped]
            assert(goodsToken && moneyToken, "token 不存在：" + [goods, money])
            const [pool, gasPrice] = await Promise.all([getPool(provider, goodsToken, moneyToken, poolFee), provider.getGasPrice()])

            let price = pool.priceOf(goodsToken).toFixed(9)
            let gasPriceGwei = utils.formatUnits(gasPrice, "gwei")
            return [Number(gasPriceGwei).toFixed(2), price]

        }
    } catch (e) {
        console.error('getGasPriceGweiAndEthPrice异常：', e.stack || e)
        throw e
    }
}

//test
/*
bookProduct("eth-usdc", 100, 0.03203).catch(e => {
    console.log(e + "" + e.message)
})
 */
//getGasPriceGweiAndEthPrice("usdc").then(arr=>{console.info(arr[0],arr[1])})

