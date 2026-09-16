import IUniswapV3PoolABI
    from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert {type: 'json'}
import {Pool, Route, SwapRouter, Tick, TICK_SPACINGS, Trade} from '@uniswap/v3-sdk'
import {Contract} from 'ethers'
import TickLensABI
    from '@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json' assert {type: 'json'}
import {CurrencyAmount, Price, Token, TradeType} from '@uniswap/sdk-core'
import {CallContract, callProvider, provider, tokens, useSmartContractWallet, wallet} from '../config.js'
import {
    atleastEarn,
    autoTradeAmountArr,
    autoTradeInSymbol,
    pools,
    providerIsDelayed,
    routes,
    smartContractWalletAddress,
    SWAP_ROUTER_ADDRESS,
    tickLens,
    uniswapV3Factory
} from './constant.js'
import {MyTickListDataProvider} from "./MyTickListDataProvider.js"
import {doubleToPersent, getTokenAmount, movePointRight, parseBookArgs, poolFeeToNumber} from '../util.js'
import assert from 'assert'
import {fillTranRequest, getProvider, getSwapQuote, sendTransactionByWallet} from "./providers.js"
import JSBI from "jsbi"


export let poolMap = {} //全面详细的多个资金池信息。key是资金池合约地址，value是PoolInfo2
let poolInfo2 //随便一个poolInfo2，作为全局变量，能让各个函数获取burnFilter和mintFilter
let updateAndTrading = false //正在进行三角套利吗？

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

export class PoolInfo2 {
    pool
    bids
    asks
    tickDataProvider //查询tick
    currentByteIndex //currentTick所在字节
    swapLog = null //swap事件的日志，null表示没有发生该事件
    hasBurnMint = false //是否发生过burn或mint
    fetchTickRunning = false
    createOrderRunning = false
    needOrderBook = false

    constructor(marketOrderSize, r, goodsToken, moneyToken, provider, swapFilter, burnFilter, mintFilter) {
        this.marketOrderSize = marketOrderSize
        this.r = r
        this.goodsToken = goodsToken
        this.moneyToken = moneyToken
        this.provider = provider
        this.swapFilter = swapFilter
        this.burnFilter = burnFilter
        this.mintFilter = mintFilter
    }
}

/**
 *
 * @param infoArr{{tokenA,tokenB,fee}[]}
 * @returns {Promise<PoolInfo[]>}
 */
export async function getPoolsInfo(infoArr) {
    if (!infoArr || infoArr.length === 0) return []
    //console.info(Date.now() + ': call getPoolsInfo, infoArr长度'+infoArr.length)
    let poolInfoArr = []
    let calls = []
    for (let info of infoArr) {
        const poolContract = new CallContract(Pool.getAddress(info.tokenA, info.tokenB, info.fee, null, uniswapV3Factory), IUniswapV3PoolABI.abi)
        calls.push(poolContract.liquidity())
        calls.push(poolContract.slot0()) //slot0的内容是[sqrtRatioX96,tickCurrent,,,]
    }
    let callsResult = await callProvider.all(calls)//返回的结果是[liquidity,slot0,liquidity,slot0,liquidity,slot0,liquidity,slot0]
    for (let i in infoArr) {
        //检查sqrtRatioX96和tickCurrent是否异常
        if (JSBI.LE(JSBI.BigInt(callsResult[i * 2 + 1][0]), '4295128740') || JSBI.GE(JSBI.BigInt(callsResult[i * 2 + 1][0]), '1461446703485210103287273052203988822378723970341')
            || callsResult[i * 2 + 1][1] <= -887272 || callsResult[i * 2 + 1][1] >= 887272
            || BigInt(callsResult[i * 2]).eq(0)
        ) {
            console.log(`getPoolsInfo异常,ratioX96=${callsResult[i * 2 + 1][0]},tickCurrent=${callsResult[i * 2 + 1][1]},交易对${infoArr[i].tokenA.symbol}-${infoArr[i].tokenB.symbol}`)
            return []
        }
        poolInfoArr.push(new PoolInfo(infoArr[i].tokenA, infoArr[i].tokenB, infoArr[i].fee, callsResult[i * 2 + 1][0], callsResult[i * 2], callsResult[i * 2 + 1][1]))
    }
    return poolInfoArr
}

/**
 * 本函数只需要调用一次
 * @return {Promise<void>}
 */
export async function initPools() {
    if (Object.keys(poolMap).length > 0) return
    console.info('开始执行initPools()函数')
    let marketOrderSize = 50
    let poolContract
    //批量查询poolInfo
    let infoArr = []//准备查询参数
    pools.forEach(p => {
        const [goodsToken, moneyToken] = parseBookArgs(p.goods + '-' + p.money)
        infoArr.push({tokenA: goodsToken, tokenB: moneyToken, fee: p.fee})
    })
    let poolInfoArr = []
    for (let i = 0, n = Math.floor(infoArr.length / 1); i <= Math.floor(infoArr.length / n); i++) {
        poolInfoArr = poolInfoArr.concat(await getPoolsInfo(infoArr.slice(i * n, (i + 1) * n)))
    }
    if (poolInfoArr.length < infoArr.length) {
        throw 'getPoolsInfo异常'
    }
    for (let i in pools) {
        let p = pools[i]
        let initPoolInfo = poolInfoArr[i]
        let r = p.fee / 1000000 + 0.0002
        const [goodsToken, moneyToken] = parseBookArgs(p.goods + '-' + p.money)
        p.address = Pool.getAddress(goodsToken, moneyToken, p.fee, null, uniswapV3Factory)
        poolContract = new Contract(p.address, IUniswapV3PoolABI.abi, provider)
        poolMap[p.address] = new PoolInfo2(marketOrderSize, r, goodsToken, moneyToken, provider, poolContract.filters.Swap(), poolContract.filters.Burn(), poolContract.filters.Mint())
        let promiseArr = []
        let lengthArr = []
        await fetchTicks(marketOrderSize, initPoolInfo, r, promiseArr, lengthArr)
        //先构造一个不带tickDataProvider的pool,因为createOnePoolTick函数要用pool的信息
        poolMap[p.address].pool = new Pool(goodsToken, moneyToken, p.fee, initPoolInfo.sqrtRatioX96, initPoolInfo.liquidity, initPoolInfo.tickCurrent, null)
        await createOnePoolTick(poolMap[p.address], await callProvider.all(promiseArr))
        poolMap[p.address].pool = new Pool(goodsToken, moneyToken, p.fee, initPoolInfo.sqrtRatioX96, initPoolInfo.liquidity, initPoolInfo.tickCurrent, poolMap[p.address].tickDataProvider)
    }
    //  为什么arb链不能依赖日志？等查到日志后再更新pool？
    // 因为arbscan.io的eth_blockNumber接口每隔8秒返回30个block。这种延迟会导致信息陈旧。这8秒内，没有查到任何新blockNumber,导致ethersJS不会去查询日志。实际上这8秒内日志在不断产生。
    // 原因是eth_blockNumber接口无法获取L2网络中尚未提交到L1链的区块。
    if (!providerIsDelayed) {
        // 监听swap事件日志。仅仅根据事件日志推测价格，准确吗？不准确，因为本次交易可能被回滚了，但是log依然保留了下来。因此日志用来触发pool查询
        provider.on({//etherscan的log查询，只支持一个topic元素，on和once同样互斥。
            address: null,
            topics: [poolInfo2.swapFilter.topics[0]]
        }, (log) => {//log数据结构：https://docs.ethers.org/v5/api/providers/types/#providers-Log
            //只有当该地址是我们想监控的地址，才处理log
            if (pools.every(p => p.address !== log.address)) return
            let poolInfo2 = poolMap[log.address]
            if (log.topics[0] === poolInfo2.swapFilter.topics[0]) {//Swap事件
                poolInfo2.swapLog = log //等本次事件处理完毕后才真的处理事件。因为swap事件会出现一大批，只应该处理最后一个。所以这里只是做一个标记
            } else if (log.topics[0] === poolInfo2.burnFilter.topics[0] || log.topics[0] === poolInfo2.mintFilter.topics[0]) {
                //(执行不到这里来，因为监听的topics只包含swap)burn和mint事件，导致流动性发生变化，需要重新查询Ticks。
                poolInfo2.hasBurnMint = true
            }

        })
        provider.on('block', () => {//多个区块批量诞生，那么就会批量为每个区块触发block事件
            //console.info(new Date() + ' block' + blockNumber + '........')
        })
        provider.on('poll', () => {//每次查询完毕，在开始处理事件之前触发
            //console.info(new Date() + ' poll........')
        })
        provider.on('didPoll', updateAndTrade)//等本次事件处理完毕后才真的开始处理。因为swap事件会出现一大批，只应该处理最后一个
    } else {//定时查询poolInfo
        setInterval(updateAndTrade, 1000)
    }


    //定时查询ticks
    setInterval(() => {
        try {
            burnMintProcess()
        } catch (e) {
            console.log(Date.now() + ' exception: burnMintProcess服务器没响应. ')
        }
    }, 20 * 1000)
}

async function updateAndTrade() {
    let beginTime = Date.now()
    //console.log(`${beginTime} begin`)
    if (updateAndTrading) {
        //console.log(new Date() + 'updateAndTrade正在运行，本次作废')
    } else {
        try {
            updateAndTrading = true
            await updatePools(true)
            await autoTradeMultiMoney() //竞争太激烈，老是踏空，白白出手续费，所以停止套利
            //console.log(`${Date.now()} updatePools耗时${Date.now() - beginTime}毫秒`)
        } catch (e) {
            console.log(beginTime + ' exception: updatePools函数异常. ')
        } finally {
            updateAndTrading = false
        }
    }
}

async function updatePools(isAll) {
    let poolInfo2Arr = isAll ? Object.values(poolMap) : Object.values(poolMap).filter(poolInfo2 => poolInfo2.swapLog)
    if (poolInfo2Arr.length > 0) {
        //console.log('poolInfo2Arr长度'+poolInfo2Arr.length)
        let infoArr = []//准备查询参数
        poolInfo2Arr.forEach(poolInfo2 => {
            infoArr.push({tokenA: poolInfo2.goodsToken, tokenB: poolInfo2.moneyToken, fee: poolInfo2.pool.fee})
        })
        let poolInfoArr = []
        for (let i = 0, n = Math.floor(infoArr.length / 1); i <= Math.floor(infoArr.length / n); i++) {
            poolInfoArr = poolInfoArr.concat(await getPoolsInfo(infoArr.slice(i * n, (i + 1) * n)))
        }
        if (poolInfoArr.length === infoArr.length) {
            for (let i in poolInfo2Arr) {
                let poolInfo = poolInfoArr[i]
                let poolInfo2 = poolInfo2Arr[i]
                let pool = poolInfo2.pool
                //缓存会失效吗？【会的】。1.记住tickCurrent所在的字，如果接下来它变到其它字，就应该让缓存失效。
                let currentByteIndex = (poolInfo.tickCurrent / poolInfo.tickSpacing) >> 8 //tickCurrent所在字
                if (poolInfo2.currentByteIndex !== currentByteIndex) {
                    let promiseArr = []
                    let lengthArr = []
                    await fetchTicks(poolInfo2.marketOrderSize, poolInfo, poolInfo2.r, promiseArr, lengthArr)
                    await createOnePoolTick(poolInfo2, await callProvider.all(promiseArr))
                }
                poolInfo2.pool = new Pool(pool.token0, pool.token1, pool.fee, poolInfo.sqrtRatioX96, poolInfo.liquidity, poolInfo.tickCurrent, poolInfo2.tickDataProvider)
                if (poolInfo2.needOrderBook) {
                    await createOrderBook(poolInfo2.pool, poolInfo2.goodsToken, poolInfo2.moneyToken, poolInfo2.marketOrderSize, poolInfo2.r, pool.fee)
                }
                poolInfo2.swapLog = null
            }
        } else {
            console.log('getPoolsInfo异常，本次updatePools取消')
        }
    }
}

/**
 * 获取pool对象。本方法可以用来启动createOrderBook
 * @param goodsToken{Token} 货物.本来不需要区分货币和货币的，但createOrderBook函数需要
 * @param moneyToken{Token} 货币
 * @param poolFee{Number} 500表示 0.05%
 * @param needOrderBook{boolean} 是否需要生成订单簿
 * @return {Promise<Pool>}
 */
export async function getPool(goodsToken, moneyToken, poolFee, needOrderBook = false) {
    let poolAddress = Pool.getAddress(goodsToken, moneyToken, poolFee, null, uniswapV3Factory)
    let poolInfo2 = poolMap[poolAddress]
    assert(poolInfo2)
    return poolInfo2.pool

}

/**
 * 处理burn和mint事件，也就是查询ticks
 *
 */
async function burnMintProcess() {
    //console.info(`开始批量查询ticks`)
    let promiseArr = []
    let lengthArr = []
    for (let poolInfo2 of Object.values(poolMap)) {
        let p = poolInfo2.pool
        await fetchTicks(poolInfo2.marketOrderSize, p, poolInfo2.r, promiseArr, lengthArr)
    }
    let tickArrArr = await callProvider.all(promiseArr)
    //console.info(`lengthArr:${lengthArr}`)
    let sum = lengthArr.reduce((a, b) => a + b)
    assert(tickArrArr.length === sum, `应该返回${sum}个数组，实际返回${tickArrArr.length}个。`)
    let poolInfoArr = Object.values(poolMap)
    for (let i in poolInfoArr) {
        let poolInfo2 = poolInfoArr[i]
        await createOnePoolTick(poolInfo2, tickArrArr.splice(0, lengthArr[i]))
    }
}

async function createOnePoolTick(poolInfo2, tickResultArr) {
    let p = poolInfo2.pool
    let sortedTickArr = tickResultArr.flat().sort((tick1, tick2) => tick1.tick - tick2.tick)
    let tickArr = []
    //智能合约返回的tick格式是 {tick,liquidityNet,liquidityGross}，因此要转换成v3-sdk里面的Tick格式 {index,liquidityNet,liquidityGross}
    sortedTickArr.forEach(tick => tickArr.push(new Tick({
        index: tick.tick,
        liquidityGross: tick.liquidityGross,
        liquidityNet: tick.liquidityNet
    })))
    if (tickArr.length === 0) {
        throw `${p.token0.symbol}-${p.token1.symbol}异常：tickArr为空，`
    }
    //console.info(new Date().toLocaleString() + `: call tickLensContract ${promiseArr.length} times, tickNum=${tickNum}, 返回tick数量${tickArr.length}`)
    poolInfo2.tickDataProvider = new MyTickListDataProvider(tickArr, TICK_SPACINGS[p.fee])
    poolInfo2.currentByteIndex = (p.tickCurrent / TICK_SPACINGS[p.fee]) >> 8
    poolInfo2.pool = new Pool(p.token0, p.token1, p.fee, p.sqrtRatioX96, p.liquidity, p.tickCurrent, poolInfo2.tickDataProvider)
    if (poolInfo2.needOrderBook) {
        await createOrderBook(poolInfo2.pool, poolInfo2.goodsToken, poolInfo2.moneyToken, poolInfo2.marketOrderSize, poolInfo2.r, p.fee)
    }
}

/**
 * 获取很多tick数据
 * tick在bitmap中是按从小到大的顺序排列的。但是TickLen.getPopulatedTicksInWord返回的却是倒序的，需要再颠倒过来。
 * @param pool {PoolInfo|Pool} 现有的pool
 * @param marketOrderSize 拉取订单数量,一般来说是100；如果只是20，能提高相应速度
 * @param r {Number} r值，也就是两个相邻挂单之间价格递增的幅度，默认r= 0.05%+0.02%
 *
 */
export async function fetchTicks(marketOrderSize, pool, r, promiseArr, lengthArr) {

    //解方程1.0001**n = (1 + r) ** marketOrderSize，可以得到n的计算公式
    let tickNum = Math.ceil(Math.log((1 + r) ** marketOrderSize) / Math.log(1.0001) / TICK_SPACINGS[pool.fee]) //需要额外向左和向右占用的tick数
    let bytes = Math.ceil(tickNum / 256) //粗略估算：需要额外向左和向右占用的字数，通常是1或2 （向上舍入）
    //bytes = 2 //todo 2024-3-5更新：uniV3允许每个人设置自己的做市范围，导致资金分布不均匀，uniV2的公式会失效。为了防止ticks不够，应尽量多获取一些ticks吧
    let indexInByte = Math.ceil(tickNum % 256) //精确计算：需要额外向左和向右占用的tick
    let currentByteIndex = (pool.tickCurrent / TICK_SPACINGS[pool.fee]) >> 8 //tickCurrent所在字
    let currentIndexInByte = (Math.abs(pool.tickCurrent) / TICK_SPACINGS[pool.fee]) % 256 //tickCurrent在某个字中的位置
    let address = Pool.getAddress(pool.token0, pool.token1, pool.fee, null, uniswapV3Factory)
    const tickLensContract = new CallContract(tickLens, TickLensABI.abi)
    let length = 1
    promiseArr.push(tickLensContract.getPopulatedTicksInWord(address, currentByteIndex))
    for (let i = 0; i < bytes; i++) { // bytes值是1或2. i值是[0]或[0,1]. 循环被执行1到2次，共返回3个或5个字长。
        if (i < (bytes - 1) || (currentIndexInByte - indexInByte) < 0) {//精确计算：最后一次for循环是否有必要执行
            promiseArr.push(tickLensContract.getPopulatedTicksInWord(address, currentByteIndex - i - 1))
            length++
        }
        if (i < (bytes - 1) || (currentIndexInByte + indexInByte) > 255) {//精确计算：最后一次for循环是否有必要执行
            promiseArr.push(tickLensContract.getPopulatedTicksInWord(address, currentByteIndex + i + 1))
            length++
        }
    }//end for
    lengthArr.push(length)

}

/**
 * 利用@uniswap/v3-sdk提供的Pool.getOutputAmount函数模拟出市场挂单，但要确保pool里面有充足的tick可被访问。
 * 设f是资金池费率，r是挂单价格增量。如果r=0.1%， 100个挂单会引起10.5%的价格波动。如果r=0.3%，100个挂单会引起35%的价格波动。如果r=f+ 0.2% = 0.5%,一百个挂单会引起65%的价格波动 . 所以我们最多处理65%的价格波动就行。
 * （实际上可以让r=0.05%+0.02% =0.07%. (r只要大于f就行了，大多少都无所谓，我们不妨让它大0.02%). 100单只会引起7.2%的波动。20单只会引起1.4%的波动，eth价格2300美元，1.4%波动就是32美元，足够覆盖真实市场情况）
 * 那么65%的价格波动，涉及到多少个tick呢？解方程1.0001**n = 1.65，得n=log1.0001(1.65)= log(1.65)/log(1.0001)= 4984。(实际上20单对应1.4%的波动，涉及到的tick是139个。100单对应7.2%的波动涉及695个tick)
 * TickLen.getPopulatedTicksInWord函数，一次最多能返回一个字节(256个)的“被填充过的有效tick”(只返回被填充过的，而不是全部有效tick。有效tick是指tickNumber % TICK_SPACING =0的)。那么：
 * 当FeeAmount=100时，费率=0.01%，TICK_SPACING=1，对该函数调用4984/1/256=19.46次就能返回4984个有效tick.(实际上如果只想覆盖139个tick,就只需调用139/1/256=0.542次；覆盖695个tick需调用0.271次)
 * 当FeeAmount=500时，费率=0.05%，TICK_SPACING=10，对该函数调用4984/10/256=1.94次就能返回498.4个有效tick(覆盖4984个). (实际上如果只想覆盖139个tick,就只需调用139/10/256=0.054次；覆盖695个tick需调用0.271次)
 * 当FeeAmount=3000时，费率=0.3%，TICK_SPACING=60，对该函数调用4984/60/256=0.32次就能返回83个有效tick(覆盖4984个).
 * 当FeeAmount=10000时，费率=1%，TICK_SPACING=200，对该函数调用4984/200/256=0.097次就能返回25个有效tick(覆盖4984个).
 * 因为我们不会使用0.01%费率的池子，也就不会出现TICK_SPACING=1的情况。所以除了获取当前字节，最多要获取左边2字节和右边2字节。共调用TickLen.getPopulatedTicksInWord函数的次数：1+2+2=5次。每调用一次，返回的数据量有点大。
 */
export async function createOrderBook(pool, goodsToken, moneyToken, marketOrderSize, r, poolFee) {
    let poolAddress = Pool.getAddress(goodsToken, moneyToken, poolFee, null, uniswapV3Factory)
    if (!poolMap[poolAddress].createOrderRunning) {
        poolMap[poolAddress].createOrderRunning = true
        try {
            //用卖的办法(输入goods)，模拟出市场买单。然后我可以提交卖单吃掉这些市场买单。
            poolMap[poolAddress].bids = await createMarketOrder(pool, goodsToken, moneyToken, marketOrderSize, r, goodsToken, poolFee)
            //用买的办法(输入money)，模拟出市场卖单。然后我可以提交买单吃掉这些市场卖单。
            poolMap[poolAddress].asks = await createMarketOrder(pool, moneyToken, goodsToken, marketOrderSize, r, goodsToken, poolFee)
            //console.info(goodsToken.symbol + '-' + moneyToken.symbol + '市场ask价:' + poolMap[poolAddress].asks[0][0] + ', address=' + poolAddress)
        } finally {
            poolMap[poolAddress].createOrderRunning = false
        }
    }
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
    根据恒定乘积公式：x * y =k,设池中有xy两种币。用a量的x能换来b量的y。请问b是多少(a和b的单位是聪或者伟)？  答：uniV2资金分布均匀，可以估算，uniV3允许每个人设置自己的做市范围，导致资金分布不均匀，无法用公式计算。
    如果是uniV2的话：如果没有手续费，就是b=ay/(a+x) ; 如果有手续费f,就是b=(1-f)ay/(x+(1-f)a)
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
    let poolArr = [] //用来调试各种报错
    for (let i = 0, tmpPool = pool; i < marketOrderSize; i++) {
        poolArr.push(tmpPool)
        inputAmountArr[i] = getInputAmount(tmpPool, inputToken, r, f) //uniV3允许每个人设置自己的做市范围，导致资金分布不均匀，无法用公式精确计算。这里只是算个大概
        if (Number(inputAmountArr[i].toFixed()) === 0) {//如果市场深度太小
            break
        }
        if (JSBI.LE(tmpPool.tickCurrent, -887272) || JSBI.GE(tmpPool.tickCurrent, 887272)
        ) {
            console.warn(`${new Date()} tmpPool.tickCurrent超出范围，i=${i},inputToken=${inputToken.symbol},outputToken=${outputToken.symbol},goodsToken=${goodsToken.symbol},tickCurrent=${tmpPool.tickCurrent},原因是获取的ticks数量太少`)
            break
        }
        ;[outputAmountArr[i], tmpPool] = await tmpPool.getOutputAmount(inputAmountArr[i])

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
    //const bigA = inputTokenTotalRawAmount.times(1 / (1 - r) - 1 / (1 - f)) //这个公式约等于r-f，于是干脆就用r-f
    const bigA = inputTokenTotalRawAmount.times(r - f)
    return CurrencyAmount.fromRawAmount(inputToken, bigA.toFixed(0))
}

/**
 * 通过调用pool.getOutputAmount来对有tickDataProvider的池子进行监视，试图发现套利机会。尝试多个金额
 * @return {Promise<void>}
 */
async function autoTradeMultiMoney() {
    let bestRouteArr = []//每个资金额度下的最优解
    for (let autoTradeAmount of autoTradeAmountArr) {
        let initInputAmount = CurrencyAmount.fromRawAmount(tokens[autoTradeInSymbol], movePointRight(autoTradeAmount, tokens[autoTradeInSymbol].decimals))
        let transRouteArr2 = [] //数组每个元素是{poolIndexArr, profit, initInputAmount,amountOut,info}
        for (let poolIndexArr of routes) {//每个路由，都需要正向、反向各检查一遍
            transRouteArr2.push(await processOneRoute(initInputAmount, poolIndexArr.slice()))
            transRouteArr2.push(await processOneRoute(initInputAmount, poolIndexArr.slice().reverse()))
        }
        bestRouteArr.push(transRouteArr2.sort((o1, o2) => o2.profit - o1.profit)[0])
    }
    bestRouteArr.sort((o1, o2) => o2.profit - o1.profit)
    if (bestRouteArr[0].profit >= 1) {
        let str = new Date() + '\n'
        for (let route of bestRouteArr) if (route.profit >= 1) str += route.info
        console.log(str)
    }

    //todo 寻找最佳交易额。采用第3个而不是第0个。第0个利润最大但也最有可能回滚
    let bestRoute
    if (bestRouteArr[0].profit >= atleastEarn) {
        bestRoute = bestRouteArr[0]
    } else {
        bestRoute = bestRouteArr[0]
    }
    if (bestRoute.profit >= atleastEarn) {
        if (false) {//todo 有了预查询，可还是落空了。是否是因为预查询浪费了宝贵的时间，导致别人抢先？那就不要预查询
            let quoteProfit = await transRoute(bestRoute.poolIndexArr, bestRoute.initInputAmount, bestRoute.amountOut, bestRoute.profit, true)
            if (quoteProfit >= atleastEarn) {
                console.log(new Date() + `套利正式开始${bestRoute.info},线上预查询利润${quoteProfit}`)
                await transRoute(bestRoute.poolIndexArr, bestRoute.initInputAmount, bestRoute.amountOut, quoteProfit, false)
            }
        } else {
            console.log(new Date() + `套利正式开始${bestRoute.info}`)
            await transRoute(bestRoute.poolIndexArr, bestRoute.initInputAmount, bestRoute.amountOut, bestRoute.profit, false)
        }
    }
}

/**
 * 找到某个路由的利润
 * @param amountIn {CurrencyAmount}
 * @param poolIndexArr
 * @return {Promise<{poolIndexArr, profit, initInputAmount,amountOut}>}// poolIndexArr和profit
 */
async function processOneRoute(amountIn, poolIndexArr) {
    let initInputAmount = amountIn
    let amountOut
    for (let i of poolIndexArr) {
        amountOut = (await poolMap[pools[i].address].pool.getOutputAmount(amountIn))[0]
        amountIn = amountOut
    }
    let profit = amountOut.subtract(initInputAmount).toFixed()
    //if (profit >= 1) console.info(new Date() + `路由[${poolIndexArr}]套利利润${profit}usdt,交易额${initInputAmount.toFixed()}`)
    return {
        poolIndexArr,
        profit: Number(profit),
        initInputAmount,
        amountOut,
        info: `路由${poolIndexArr}利润${profit}交易额${initInputAmount.toFixed()} \n`
    }
}

/**
 * 执行和预执行
 * @param poolIndexArr
 * @param inputAmount
 * @param outputAmount
 * @param profit
 * @param isQuote
 * @return {Promise<number|string>}
 */
export async function transRoute(poolIndexArr, inputAmount, outputAmount, profit, isQuote) {
    let tradeType = TradeType.EXACT_OUTPUT
    //如果是EXACT_OUTPUT，那么tradeType不需要我来颠倒，SwapRouter.swapCallParameters调用encodeRouteToPath时，会负责把它颠倒
    let poolArr = []
    for (let i of poolIndexArr) poolArr.push(poolMap[pools[i].address].pool)
    const swapRoute = new Route(poolArr, inputAmount.currency, outputAmount.currency) //route如果包含多个池，这些池必须有序排列、紧密衔接(也叫多跳)，例如：a/b, b/c, c/d
    if (isQuote) {
        return tradeType === TradeType.EXACT_OUTPUT ?
            outputAmount.toFixed() - (await getSwapQuote(getProvider(), swapRoute, outputAmount, inputAmount.currency, tradeType))
            : (await getSwapQuote(getProvider(), swapRoute, inputAmount, outputAmount.currency, tradeType)) - inputAmount.toFixed()
    } else {
        let recipient = useSmartContractWallet ? smartContractWalletAddress : wallet.address
        let trade = Trade.createUncheckedTrade({
            route: swapRoute,
            inputAmount: inputAmount,
            outputAmount: outputAmount,
            tradeType: tradeType,
        })
        const methodParameters = SwapRouter.swapCallParameters([trade], {
            slippageTolerance: doubleToPersent(profit / inputAmount.toFixed()),
            deadline: Math.floor(Date.now() / 1000) + 5,
            recipient: recipient
        })
        await sendTransactionByWallet({
            ...fillTranRequest(null, methodParameters.calldata, SWAP_ROUTER_ADDRESS, methodParameters.value, recipient),
        }, 10, 0.1)
        return 0
    }
}


