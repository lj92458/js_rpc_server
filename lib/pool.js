import IUniswapV3PoolABI
    from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert {type: 'json'}
import {Pool, Route, SwapRouter, Tick, TICK_SPACINGS, Trade} from '@uniswap/v3-sdk'
import ethers, {Contract} from 'ethers'
import TickLensABI
    from '@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json' assert {type: 'json'}
import {CurrencyAmount, Price, Token, TradeType} from '@uniswap/sdk-core'
import {CallContract, callProvider, provider, tokens, useSmartContractWallet, wallet} from '../config.js'
import {
    tickLens,
    uniswapV3Factory,
    pools,
    routes,
    SWAP_ROUTER_ADDRESS,
    smartContractWalletAddress,
    autoTradeInSymbol, autoTradeInAmount, atleastEarn
} from './constant.js'
import {MyTickListDataProvider} from "./MyTickListDataProvider.js";
import {doubleToPersent, getTokenAmount, movePointRight, parseBookArgs, poolFeeToNumber} from '../util.js'
import assert from 'assert'
import {fillTranRequest, sendTransactionByWallet} from "./providers.js";
import JSBI from "jsbi";

const ifaceV3Pool = new ethers.utils.Interface(IUniswapV3PoolABI.abi)

export let poolMap = {} //全面详细的多个资金池信息。key是资金池合约地址，value是PoolInfo2
let poolInfo2 //随便一个poolInfo2，作为全局变量，能让各个函数获取burnFilter和mintFilter
let autoTrading = false //正在进行三角套利吗？

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
        //检查ratioX96和tickCurrent是否异常
        if (JSBI.LE(JSBI.BigInt(callsResult[i * 2 + 1][0]), '4295128740')
            || JSBI.GE(JSBI.BigInt(callsResult[i * 2 + 1][0]), '1461446703485210103287273052203988822378723970341')
            || callsResult[i * 2 + 1][1] <= -887272 || callsResult[i * 2 + 1][1] >= 887272
        ) {
            console.log(`getPoolsInfo异常,ratioX96=${callsResult[i * 2 + 1][0]},tickCurrent=${callsResult[i * 2 + 1][1]}`)
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
    for (let p of pools) {
        let r = p.fee / 1000000 + 0.0002
        const [goodsToken, moneyToken] = parseBookArgs(p.goods + '-' + p.money)
        p.address = Pool.getAddress(goodsToken, moneyToken, p.fee, null, uniswapV3Factory)
        poolContract = new Contract(p.address, IUniswapV3PoolABI.abi, provider)
        let initPoolInfo = (await getPoolsInfo([{tokenA: goodsToken, tokenB: moneyToken, fee: p.fee}]))[0]
        poolMap[p.address] = new PoolInfo2(marketOrderSize, r, goodsToken, moneyToken, provider, poolContract.filters.Swap(), poolContract.filters.Burn(), poolContract.filters.Mint())
        poolInfo2 = poolMap[p.address]
        await fetchTicks(marketOrderSize, initPoolInfo, r)
        poolMap[p.address].pool = new Pool(goodsToken, moneyToken, p.fee, initPoolInfo.sqrtRatioX96, initPoolInfo.liquidity, initPoolInfo.tickCurrent, poolMap[p.address].tickDataProvider)
        await createOrderBook(poolMap[p.address].pool, goodsToken, moneyToken, marketOrderSize, r, p.fee)
    }

    //监听swap事件。根据事件log推测出来的当前价格，准确吗？不准确，因为本次交易可能被回滚了，但是log依然保留了下来
    provider.on({//etherscan的log查询，只支持一个topic元素，on和once同样互斥。
        address: null,
        topics: [poolInfo2.swapFilter.topics[0]]
    }, (log) => {//log数据结构：https://docs.ethers.org/v5/api/providers/types/#providers-Log
        //只有当该地址是我们想监控的地址，才处理log
        if (pools.every(p => p.address !== log.address)) return
        let thisPoolInfo = poolMap[log.address]
        if (log.topics[0] === thisPoolInfo.swapFilter.topics[0]) {//Swap事件
            thisPoolInfo.swapLog = log //等本次事件处理完毕后才真的处理事件。因为swap事件会出现一大批，只应该处理最后一个。所以这里只是做一个标记
        } else if (log.topics[0] === thisPoolInfo.burnFilter.topics[0] || log.topics[0] === thisPoolInfo.mintFilter.topics[0]) {
            //(执行不到这里来，因为监听的topics只包含swap)burn和mint事件，导致流动性发生变化，需要重新查询Ticks。
            thisPoolInfo.hasBurnMint = true
        }

    })
    provider.on('block', (blockNumber) => {//多个区块批量诞生，那么就会批量为每个区块触发block事件
        //console.info(new Date() + ' block' + blockNumber + '........')
    })
    provider.on('poll', async () => {//每次查询完毕，在开始处理事件之前触发
        //console.info(new Date() + ' poll........')
    })
    provider.on('didPoll', async () => {//等本次事件处理完毕后才真的触发事件。因为swap事件会出现一大批，只应该处理最后一个
        //批量查询poolInfo
        let poolInfo2Arr = Object.values(poolMap).filter(poolInfo2 => poolInfo2.swapLog)
        if (poolInfo2Arr.length > 0) {
            //console.log('poolInfo2Arr长度'+poolInfo2Arr.length)
            let infoArr = []//准备查询参数
            poolInfo2Arr.forEach(poolInfo2 => {
                infoArr.push({tokenA: poolInfo2.goodsToken, tokenB: poolInfo2.moneyToken, fee: poolInfo2.pool.fee})
            })
            let poolInfoArr = []
            try {
                for (let i = 0, n = 6; i <= Math.floor(infoArr.length / n); i++) {
                    poolInfoArr = poolInfoArr.concat(await getPoolsInfo(infoArr.slice(i * n, (i + 1) * n)));
                }
                for (let i in poolInfo2Arr) {
                    let poolInfo2 = poolInfo2Arr[i]
                    await swapProcess(poolInfo2, poolInfo2.swapLog, poolInfoArr[i])
                    poolInfo2.swapLog = null
                }
                await autoTradeWithTicks()
            } catch (e) {
                console.log(Date.now() + ' exception: 服务器没响应. poolInfo2Arr长度' + poolInfo2Arr.length);
            }
        }

    })

    //定时查询ticks
    let timeSpace = 5000 //每3秒提交一个ticks查询请求
    setInterval(() => {
        let i = 0
        for (let key in poolMap) {
            setTimeout(() => burnMintProcess(poolMap[key]), timeSpace * i++)
        }
    }, Object.keys(poolMap).length * timeSpace)
}


/**
 * 利用ethers.js的订阅机制，监听并维护pool对象，
 * @param goodsToken{Token} 货物.本来不需要区分货币和货币的，但createOrderBook函数需要
 * @param moneyToken{Token} 货币
 * @param poolFee{Number} 500表示 0.05%
 * @return {Promise<Pool>}
 */
export async function getPool(goodsToken, moneyToken, poolFee) {
    let poolAddress = Pool.getAddress(goodsToken, moneyToken, poolFee, null, uniswapV3Factory)
    if (Object.keys(poolMap).length === 0) {
        await initPools()
    }
    assert(poolMap[poolAddress])
    return poolMap[poolAddress].pool

}

/**
 * 根据事件log推测出来的当前价格，准确吗？不准确，因为本次交易可能被回滚了，但是log依然保留了下来
 * @param thisPoolInfo{PoolInfo2}
 * @param log
 * @param currentPoolInfo{PoolInfo}
 * @return {Promise<void>}
 */
async function swapProcess(thisPoolInfo, log, currentPoolInfo) {
    //console.info(new Date() + ' ' + thisPoolInfo.goodsToken.symbol + '-' + thisPoolInfo.moneyToken.symbol + '处理swap事件' + log.address)
    let pool = thisPoolInfo.pool
    /* log推测出来的当前价格不准确，因此弃用
    let parsedLog = ifaceV3Pool.parseLog(log)
    let currentPoolInfo = new PoolInfo(pool.token0, pool.token1, pool.fee, parsedLog.args[4], parsedLog.args[5], parsedLog.args[6])
    */
    //缓存会失效吗？【会的】。1.记住tickCurrent所在的字，如果接下来它变到其它字，就应该让缓存失效。
    let currentByteIndex = (currentPoolInfo.tickCurrent / currentPoolInfo.tickSpacing) >> 8 //tickCurrent所在字
    if (thisPoolInfo.currentByteIndex !== currentByteIndex) {
        await fetchTicks(thisPoolInfo.marketOrderSize, currentPoolInfo, thisPoolInfo.r)
    }
    thisPoolInfo.pool = new Pool(pool.token0, pool.token1, pool.fee, currentPoolInfo.sqrtRatioX96, currentPoolInfo.liquidity, currentPoolInfo.tickCurrent, thisPoolInfo.tickDataProvider)
    await createOrderBook(thisPoolInfo.pool, thisPoolInfo.goodsToken, thisPoolInfo.moneyToken, thisPoolInfo.marketOrderSize, thisPoolInfo.r, pool.fee)
}

/**
 * 处理burn和mint事件，也就是查询ticks
 * @param thisPoolInfo {PoolInfo2}
 */
async function burnMintProcess(thisPoolInfo) {
    //console.info(Date() + ' ' + thisPoolInfo.goodsToken.symbol + '-' + thisPoolInfo.moneyToken.symbol + '处理burn和mint事件' + thisPoolInfo.pool.address)
    let p = thisPoolInfo.pool
    await fetchTicks(thisPoolInfo.marketOrderSize, p, thisPoolInfo.r)
    thisPoolInfo.pool = new Pool(p.token0, p.token1, p.fee, p.sqrtRatioX96, p.liquidity, p.tickCurrent, thisPoolInfo.tickDataProvider)
    await createOrderBook(thisPoolInfo.pool, thisPoolInfo.goodsToken, thisPoolInfo.moneyToken, thisPoolInfo.marketOrderSize, thisPoolInfo.r, p.fee)

}

/**
 * 获取很多tick数据
 * tick在bitmap中是按从小到大的顺序排列的。但是TickLen.getPopulatedTicksInWord返回的却是倒序的，需要再颠倒过来。
 * @param pool {PoolInfo|Pool} 现有的pool
 * @param marketOrderSize 拉取订单数量,一般来说是100；如果只是20，能提高相应速度
 * @param r {Number} r值，也就是两个相邻挂单之间价格递增的幅度，默认r= 0.05%+0.02%
 * @return {Promise<MyTickListDataProvider>} 包含足够ticks的新pool
 */
export async function fetchTicks(marketOrderSize, pool, r) {
    let poolAddress = Pool.getAddress(pool.token0, pool.token1, pool.fee, null, uniswapV3Factory)
    //解方程1.0001**n = (1 + r) ** marketOrderSize，可以得到n的计算公式
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
    try {
        let sortedTickArr = (await callProvider.all(promiseArr)).flat().sort((tick1, tick2) => tick1.tick - tick2.tick);
        //智能合约返回的tick格式是 {tick,liquidityNet,liquidityGross}，因此要转换成v3-sdk里面的Tick格式 {index,liquidityNet,liquidityGross}
        let tickArr = [];
        sortedTickArr.forEach(tick => tickArr.push(new Tick({
            index: tick.tick,
            liquidityGross: tick.liquidityGross,
            liquidityNet: tick.liquidityNet
        })));
        //console.info(new Date().toLocaleString() + `: call tickLensContract ${promiseArr.length} times, tickNum=${tickNum}, 返回tick数量${tickArr.length}`)
        poolMap[poolAddress].tickDataProvider = new MyTickListDataProvider(tickArr, pool.tickSpacing);
        poolMap[poolAddress].currentByteIndex = currentByteIndex;
    } catch (e) {
        console.log(Date.now() + ' exception: fetchTicks异常，promiseArr长度' + promiseArr.length);
    }
    return poolMap[poolAddress].tickDataProvider

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
async function createOrderBook(pool, goodsToken, moneyToken, marketOrderSize, r, poolFee) {
    let poolAddress = Pool.getAddress(goodsToken, moneyToken, poolFee, null, uniswapV3Factory)
    //用卖的办法(输入goods)，模拟出市场买单。然后我可以提交卖单吃掉这些市场买单。
    poolMap[poolAddress].bids = await createMarketOrder(pool, goodsToken, moneyToken, marketOrderSize, r, goodsToken, poolFee)
    //用买的办法(输入money)，模拟出市场卖单。然后我可以提交买单吃掉这些市场卖单。
    poolMap[poolAddress].asks = await createMarketOrder(pool, moneyToken, goodsToken, marketOrderSize, r, goodsToken, poolFee)
    //console.info(goodsToken.symbol + '-' + moneyToken.symbol + '市场ask价:' + poolMap[poolAddress].asks[0][0] + ', address=' + poolAddress)
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
    if (inputToken.symbol.indexOf('usd') >= 0 && outputToken.symbol.indexOf('usd') >= 0) {
        return
    }
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
            break
        }
        if (JSBI.LE(tmpPool.sqrtRatioX96, '4295128740')
            || JSBI.GE(tmpPool.sqrtRatioX96, '1461446703485210103287273052203988822378723970341')
        ) {
            console.warn(`tmpPool.sqrtRatioX96超出范围，i=${i},inputToken=${inputToken.symbol},outputToken=${outputToken.symbol},goodsToken=${goodsToken.symbol},tickCurrent=${tmpPool.tickCurrent},ticks数量`)
            break
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
    //const bigA = inputTokenTotalRawAmount.times(0.0002)
    return CurrencyAmount.fromRawAmount(inputToken, bigA.toFixed(0))
}

/**
 * 通过调用pool.getOutputAmount来对有tickDataProvider的池子进行监视，试图发现套利机会
 */
async function autoTradeWithTicks() {
    if (autoTrading) {
        console.log(new Date() + 'autoTradeWithTicks正在运行，本次作废')
    } else {
        try {
            autoTrading = true
            let initInputAmount = CurrencyAmount.fromRawAmount(tokens[autoTradeInSymbol], movePointRight(autoTradeInAmount, tokens[autoTradeInSymbol].decimals))
            let transRouteArr = [] //数组每个元素是{poolIndexArr, profit, amountOut}
            for (let poolIndexArr of routes) {//每个路由，都需要正向、反向各检查一遍
                transRouteArr.push(await processOneRoute(initInputAmount, poolIndexArr))
                transRouteArr.push(await processOneRoute(initInputAmount, poolIndexArr.slice().reverse()))
            }
            //寻找最大利润。如果利润还可以，就开始执行套利
            let bestRoute = transRouteArr.sort((o1, o2) => o2.profit - o1.profit)[0]
            //console.log(`bestRoute.profit=${bestRoute.profit}`)
            if (bestRoute.profit >= atleastEarn) {
                console.log(new Date() + `套利正式开始：路由${bestRoute.poolIndexArr},利润${bestRoute.profit}`)
                await transRoute(bestRoute.poolIndexArr, initInputAmount, bestRoute.amountOut, bestRoute.profit)
                console.log(new Date() + '套利结束')
            }
        } finally {
            autoTrading = false
        }
    }
}

/**
 *
 * @param amountIn {CurrencyAmount}
 * @param poolIndexArr
 * @return {Promise<{poolIndexArr, profit, amountOut}>}// poolIndexArr和profit
 */
async function processOneRoute(amountIn, poolIndexArr) {
    let initInputAmount = amountIn
    let amountOut
    for (let i of poolIndexArr) {
        amountOut = (await poolMap[pools[i].address].pool.getOutputAmount(amountIn))[0]
        amountIn = amountOut
    }
    let profit = amountOut.subtract(initInputAmount).toFixed()
    //console.info(new Date() + `路由[${poolIndexArr}]套利利润${profit}usdt`)
    if (profit >= 3) console.info(new Date() + `路由[${poolIndexArr}]套利利润${profit}usdt`)
    return {poolIndexArr, profit: Number(profit), amountOut}
}

async function transRoute(poolIndexArr, initInputAmount, outputAmount, profit) {
    let poolArr = []
    for (let i of poolIndexArr) poolArr.push(poolMap[pools[i].address].pool)

    const swapRoute = new Route(poolArr, initInputAmount.currency, initInputAmount.currency) //route如果包含多个池，这些池必须有序排列、紧密衔接(也叫多跳)，例如：a/b, b/c, c/d
    let trade = Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: initInputAmount,
        outputAmount: outputAmount,
        tradeType: TradeType.EXACT_INPUT,
    })
    let recipient = useSmartContractWallet ? smartContractWalletAddress : wallet.address
    const methodParameters = SwapRouter.swapCallParameters([trade], {
        slippageTolerance: doubleToPersent(profit / autoTradeInAmount),
        deadline: Math.floor(Date.now() / 1000) + 10,
        recipient: recipient
    })

    return await sendTransactionByWallet({
        ...fillTranRequest(null, methodParameters.calldata, SWAP_ROUTER_ADDRESS, methodParameters.value, recipient),
    }, 10, 0.1)
}
