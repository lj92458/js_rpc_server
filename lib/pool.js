import IUniswapV3PoolABI
    from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert {type: 'json'}
import {Pool, Tick, TICK_SPACINGS} from '@uniswap/v3-sdk'
import ethers, {Contract} from 'ethers'
import TickLensABI
    from '@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json' assert {type: 'json'}
import {CurrencyAmount, Price, Token} from '@uniswap/sdk-core'
import {CallContract, callProvider,} from '../config.js'
import {tickLens, uniswapV3Factory} from './constant.js'
import {MyTickListDataProvider} from "./MyTickListDataProvider.js";
import {getTokenAmount, poolFeeToNumber} from '../util.js'
import assert from 'assert'

const ifaceV3Pool = new ethers.utils.Interface(IUniswapV3PoolABI.abi)
//查询tick,并创建新pool对象
let tickDataProviderCache = null
let currentByteIndexCache = 0
let queryTicksTime = 0 //最后一次查询ticks的时间
let poolCache = null
export let bidsCache, asksCache

/**
 * 资金池信息
 *   token0: {string}
 *   token1: {string}
 *   fee: {number} 500表示百万分之500，也就是0.0005，也就是0.05%
 *   tickSpacing: {number}
 *   liquidity: {ethers.BigNumber}
 *   sqrtRatioX96: {ethers.BigNumber} 池的当前价格作为 sqrt(token1/token0)的Q64.96格式，也叫做sqrtRatioX96
 *   tickCurrent: {number} 当前市场价格在哪个价格区间
 */
export class PoolInfo {
    token0
    token1
    fee
    liquidity
    sqrtRatioX96
    tickCurrent

    constructor(tokenA, tokenB, fee, sqrtRatioX96, liquidity, tickCurrent) {
        [this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
        this.fee = fee
        this.sqrtRatioX96 = sqrtRatioX96
        this.liquidity = liquidity
        this.tickCurrent = tickCurrent
    }

    get tickSpacing() {
        return TICK_SPACINGS[this.fee]
    }

    get address() {
        return Pool.getAddress(this.token0, this.token1, this.fee, null, uniswapV3Factory)
    }

}

/**
 *
 * @param provider
 * @param tokenA
 * @param tokenB
 * @param poolFee {number} 枚举类型FeeAmount的值：500表示0.05%,3000表示0.3%,10000表示1%
 * @returns {Promise<PoolInfo>}
 */
export async function getPoolInfo(provider, tokenA, tokenB, poolFee) {
    console.log(new Date().toLocaleString() + ': call poolContract 2 times')
    const poolContract = new CallContract(Pool.getAddress(tokenA, tokenB, poolFee, null, uniswapV3Factory), IUniswapV3PoolABI.abi)

    const [liquidity, slot0] =
        await callProvider.all([
            poolContract.liquidity(),//bigNumber
            poolContract.slot0(),
        ])
    return new PoolInfo(tokenA, tokenB, poolFee, slot0[0], liquidity, slot0[1])
}


/**
 * 利用ethers.js的订阅机制，监听并维护pool对象，
 * @param provider {BaseProvider}
 * @param goodsToken{Token} 货物.本来不需要区分货币和货币的，但createOrderBook函数需要
 * @param moneyToken{Token} 货币
 * @param poolFee{Number}
 * @param marketOrderSize{Number} 拉取的挂单数量。默认值0表示不拉取
 * @param r {Number} r值，又叫orderStepRatio.也就是两个相邻挂单之间价格递增的幅度，默认r= 0.05%+0.02%
 * @return {Promise<Pool>}
 */
export async function getPool(provider, goodsToken, moneyToken, poolFee, marketOrderSize = 100, r = 0.0007) {
    let [token0, token1] = goodsToken.sortsBefore(moneyToken) ? [goodsToken, moneyToken] : [moneyToken, goodsToken]
    if (!poolCache || !poolCache.token0.equals(token0) || !poolCache.token1.equals(token1) || poolCache.fee !== poolFee) {
        poolCache = tickDataProviderCache = null
        queryTicksTime = currentByteIndexCache = 0
        //取消现有的监听，开始新的监听。
        provider.removeAllListeners()  //取消对任何合约地址的Swap事件的监听，因此这里传递的是topics，而不是filter对象：{address:xxx,topics:[]}
        let poolAddress = Pool.getAddress(goodsToken, moneyToken, poolFee, null, uniswapV3Factory)

        let initPoolInfo = await getPoolInfo(provider, goodsToken, moneyToken, poolFee)
        await fetchTicks(marketOrderSize, initPoolInfo, r)
        poolCache = new Pool(goodsToken, moneyToken, poolFee, initPoolInfo.sqrtRatioX96, initPoolInfo.liquidity, initPoolInfo.tickCurrent, tickDataProviderCache)
        await createOrderBook(poolCache, goodsToken, moneyToken, marketOrderSize, r, poolFee)

        let poolContract = new Contract(poolAddress, IUniswapV3PoolABI.abi, provider)
        let swapFilter = poolContract.filters.Swap()
        let burnFilter = poolContract.filters.Burn()
        let mintFilter = poolContract.filters.Mint()
        provider.on(
            {address: poolAddress},
            async (log) => {//log数据结构：https://docs.ethers.org/v5/api/providers/types/#providers-Log
                if (log.topics[0] === swapFilter.topics[0]) {//Swap事件，导致价格发生变化，可能要重新获取ticks
                    //console.log('处理swap事件')
                    let parsedLog = ifaceV3Pool.parseLog(log)
                    let currentPoolInfo = new PoolInfo(goodsToken, moneyToken, poolFee, parsedLog.args[4], parsedLog.args[5], parsedLog.args[6])
                    //缓存会失效吗？【会的】。1.记住tickCurrent所在的字，如果接下来它变到其它字，就应该让缓存失效。
                    let currentByteIndex = (currentPoolInfo.tickCurrent / currentPoolInfo.tickSpacing) >> 8 //tickCurrent所在字
                    if (currentByteIndexCache !== currentByteIndex) {
                        currentByteIndexCache = currentByteIndex
                        await fetchTicks(marketOrderSize, currentPoolInfo, r)
                    }
                    poolCache = new Pool(goodsToken, moneyToken, poolFee, currentPoolInfo.sqrtRatioX96, currentPoolInfo.liquidity, currentPoolInfo.tickCurrent, tickDataProviderCache)
                    await createOrderBook(poolCache, goodsToken, moneyToken, marketOrderSize, r, poolFee)
                } else if (log.topics[0] === burnFilter.topics[0] || log.topics[0] === mintFilter.topics[0]) {//burn和mint事件，导致流动性发生变化，需要重新查询Ticks
                    if (Date.now() - queryTicksTime > provider.pollingInterval) {//queryTicks返回数据很多，很耗资源，因此不轻易启动
                        console.log('处理burn和mint事件')
                        queryTicksTime = Date.now()
                        await fetchTicks(marketOrderSize, poolCache, r)
                        if (poolCache) {
                            poolCache = new Pool(goodsToken, moneyToken, poolFee, poolCache.sqrtRatioX96, poolCache.liquidity, poolCache.tickCurrent, tickDataProviderCache)
                            await createOrderBook(poolCache, goodsToken, moneyToken, marketOrderSize, r, poolFee)
                        }
                    }
                }

            })
    }

    return poolCache

}

/**
 * 获取很多tick数据
 * tick在bitmap中是按从小到大的顺序排列的。但是TickLen.getPopulatedTicksInWord返回的却是倒序的，需要再颠倒过来。
 * @param pool {PoolInfo|Pool} 现有的pool
 * @param marketOrderSize 拉取订单数量,一般来说是100；如果只是20，能提高相应速度
 * @param r {Number} r值，也就是两个相邻挂单之间价格递增的幅度，默认r= 0.05%+0.02%
 * @return {Promise<void>} 包含足够ticks的新pool
 */
export async function fetchTicks(marketOrderSize, pool, r) {
    let tickNum = Math.ceil(Math.log((1 + r) ** marketOrderSize) / Math.log(1.0001) / TICK_SPACINGS[pool.fee]) //需要额外向左和向右占用的tick数
    let bytes = Math.ceil(tickNum / 256) //粗略估算：需要额外向左和向右占用的字数，通常是1或2 （向上舍入）
    let indexInByte = Math.ceil(tickNum % 256) //精确计算：需要额外向左和向右占用的tick
    let currentByteIndex = (pool.tickCurrent / pool.tickSpacing) >> 8 //tickCurrent所在字
    let currentIndexInByte = (Math.abs(pool.tickCurrent) / pool.tickSpacing) % 256 //tickCurrent在某个字中的位置
    let address = Pool.getAddress(pool.token0, pool.token1, pool.fee, null, uniswapV3Factory)
    const tickLensContract = new CallContract(tickLens, TickLensABI.abi)
    let promiseArr = []
    promiseArr.push(tickLensContract.getPopulatedTicksInWord(address, currentByteIndex))
    for (let i = 0; i < bytes; i++) {//bytes值是1或2. i值是[0]或[0,1]. 循环被执行1到2次，共返回3个或5个字长。
        if (i < (bytes - 1) || (currentIndexInByte - indexInByte) < 0) {//精确计算：最后一次for循环是否有必要执行
            promiseArr.push(tickLensContract.getPopulatedTicksInWord(address, currentByteIndex - i - 1))
        }
        if (i < (bytes - 1) || (currentIndexInByte + indexInByte) > 255) {//精确计算：最后一次for循环是否有必要执行
            promiseArr.push(tickLensContract.getPopulatedTicksInWord(address, currentByteIndex + i + 1))
        }

    }//end for
    let sortedTickArr = (await callProvider.all(promiseArr)).flat().sort((tick1, tick2) => tick1.tick - tick2.tick)
    //智能合约返回的tick格式是 {tick,liquidityNet,liquidityGross}，因此要转换成v3-sdk里面的Tick格式 {index,liquidityNet,liquidityGross}
    let tickArr = []
    sortedTickArr.forEach(tick => tickArr.push(new Tick({
        index: tick.tick,
        liquidityGross: tick.liquidityGross,
        liquidityNet: tick.liquidityNet
    })))
    console.log(new Date().toLocaleString() + `: call tickLensContract ${promiseArr.length} times, tick总量${tickArr.length}`)
    tickDataProviderCache = new MyTickListDataProvider(tickArr, pool.tickSpacing)
    currentByteIndexCache = currentByteIndex

}

/**
 * 利用@uniswap/v3-sdk提供的Pool.getOutputAmount函数模拟出市场挂单，但要确保pool里面有充足的tick可被访问。
 * 设f是资金池费率，r是挂单价格增量。如果r=0.1%， 100个挂单会引起10.5%的价格波动。如果r=0.3%，100个挂单会引起35%的价格波动。如果r=f+ 0.2% = 0.5%,一百个挂单会引起65%的价格波动 . 所以我们最多处理65%的价格波动就行。
 * （实际上可以让r=0.05%+0.02% =0.07%. (r只要大于f就行了，大多少都无所谓，我们不妨让它大0.02%). 100单只会引起7.2%的波动。20单只会引起1.4%的波动，eth价格2300美元，1.4%波动就是32美元，足够覆盖真实市场情况）
 * 那么65%的价格波动，涉及到多少个tick呢？解方程1.0001**n = 1.65，得n=log1.0001(1.65)= log(1.65)/log(1.0001)= 4984。(实际上20单对应1.4%的波动，涉及到的tick是139个。100单对应7.2%的波动涉及695个tick)
 * TickLen.getPopulatedTicksInWord函数，一次最多能返回一个字节(256个)的“被填充过的有效tick”(只返回被填充过的，而不是全部有效tick。有效tick是指tickNumber % TICK_SPACING =0的)。那么：
 * 当FeeAmount=100时，费率=0.01%，TICK_SPACING=1，对该函数调用4984/1/256=19.46次就能返回4984个有效tick.
 * 当FeeAmount=500时，费率=0.05%，TICK_SPACING=10，对该函数调用4984/10/256=1.94次就能返回498.4个有效tick(覆盖4984个). (实际上如果只想覆盖139个tick,就只需调用139/10/256=0.054次；覆盖695个tick需调用0.271次)
 * 当FeeAmount=3000时，费率=0.3%，TICK_SPACING=60，对该函数调用4984/60/256=0.32次就能返回83个有效tick(覆盖4984个).
 * 当FeeAmount=10000时，费率=1%，TICK_SPACING=200，对该函数调用4984/200/256=0.097次就能返回25个有效tick(覆盖4984个).
 * 因为我们不会使用0.01%费率的池子，也就不会出现TICK_SPACING=1的情况。所以除了获取当前字节，最多要获取左边2字节和右边2字节。共调用TickLen.getPopulatedTicksInWord函数的次数：1+2+2=5次。每调用一次，返回的数据量有点大。
 */
async function createOrderBook(pool, goodsToken, moneyToken, marketOrderSize, r, poolFee) {
    //用卖的办法(输入goods)，模拟出市场买单。然后我可以提交卖单吃掉这些市场买单。
    bidsCache = await createMarketOrder(pool, goodsToken, moneyToken, marketOrderSize, r, goodsToken, poolFee)
    //用买的办法(输入money)，模拟出市场卖单。然后我可以提交买单吃掉这些市场卖单。
    asksCache = await createMarketOrder(pool, moneyToken, goodsToken, marketOrderSize, r, goodsToken, poolFee)
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
        if (Number(inputAmount.toFixed()) === 0) {//如果市场深度太小
            break;
        }
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
