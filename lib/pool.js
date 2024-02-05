import IUniswapV3PoolABI
    from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert {type: 'json'}
import {Pool, Tick, TICK_SPACINGS} from '@uniswap/v3-sdk'
import ethers, {Contract} from 'ethers'
import TickLensABI
    from '@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json' assert {type: 'json'}
import {Token} from '@uniswap/sdk-core'
import {CallContract, callProvider,} from '../config.js'
import {tickLens, uniswapV3Factory} from './constant.js'
import {MyTickListDataProvider} from "./MyTickListDataProvider.js";

const ifaceV3Pool = new ethers.utils.Interface(IUniswapV3PoolABI.abi)
//查询tick,并创建新pool对象
let tickDataProviderCache = null
let currentByteIndexCache = 0
let queryTicksTime = 0 //最后一次查询ticks的时间
let poolCache = null

/**
 * 资金池信息
 *   token0: {string}
 *   token1: {string}
 *   fee: {number} 500表示百万分之500，也就是0.0005，也就是0.05%
 *   tickSpacing: {number}
 *   liquidity: {ethers.BigNumber}
 *   sqrtPriceX96: {ethers.BigNumber} 池的当前价格作为 sqrt(token1/token0)的Q64.96格式，也叫做sqrtRatioX96
 *   tickCurrent: {number} 当前市场价格在哪个价格区间
 */
export class PoolInfo {
    token0
    token1
    fee
    liquidity
    sqrtPriceX96
    tickCurrent

    constructor(tokenA, tokenB, fee, sqrtPriceX96, liquidity, tickCurrent) {
        [this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
        this.fee = fee
        this.sqrtPriceX96 = sqrtPriceX96
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
 * @param tokenA{Token}
 * @param tokenB{Token}
 * @param poolFee{Number}
 * @param marketOrderSize{Number} 拉取的挂单数量。默认值0表示不拉取
 * @param r {Number} r值，也就是两个相邻挂单之间价格递增的幅度，默认r= 0.05%+0.02%
 * @return {Promise<Pool>}
 */
export async function getPool(provider, tokenA, tokenB, poolFee, marketOrderSize = 0, r = 0.0007) {
    let [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    if (!poolCache || !poolCache.token0.equals(token0) || !poolCache.token1.equals(token1) || poolCache.fee !== poolFee) {
        poolCache = tickDataProviderCache = null
        queryTicksTime = currentByteIndexCache = 0
        //取消现有的监听，开始新的监听。
        provider.removeAllListeners()  //取消对任何合约地址的Swap事件的监听，因此这里传递的是topics，而不是filter对象：{address:xxx,topics:[]}
        let poolAddress = Pool.getAddress(tokenA, tokenB, poolFee, null, uniswapV3Factory)

        let initPoolInfo = await getPoolInfo(provider, tokenA, tokenB, poolFee)
        await fetchTicks(marketOrderSize, initPoolInfo, r)
        poolCache = new Pool(tokenA, tokenB, poolFee, initPoolInfo.sqrtPriceX96, initPoolInfo.liquidity, initPoolInfo.tickCurrent, tickDataProviderCache)

        let poolContract = new Contract(poolAddress, IUniswapV3PoolABI.abi, provider)
        let swapFilter = poolContract.filters.Swap()
        let burnFilter = poolContract.filters.Burn()
        let mintFilter = poolContract.filters.Mint()
        provider.on(
            {address: poolAddress},
            async (log) => {//log数据结构：https://docs.ethers.org/v5/api/providers/types/#providers-Log
                if (log.topics[0] === swapFilter.topics[0]) {//Swap事件，导致价格发生变化，可能要重新获取ticks
                    console.log('处理swap事件')
                    let parsedLog = ifaceV3Pool.parseLog(log)
                    let currentPoolInfo = new PoolInfo(tokenA, tokenB, poolFee, parsedLog.args[4], parsedLog.args[5], parsedLog.args[6])
                    //缓存会失效吗？【会的】。1.记住tickCurrent所在的字，如果接下来它变到其它字，就应该让缓存失效。
                    let currentByteIndex = (currentPoolInfo.tickCurrent / currentPoolInfo.tickSpacing) >> 8 //tickCurrent所在字
                    if (currentByteIndexCache !== currentByteIndex) {
                        currentByteIndexCache = currentByteIndex
                        await fetchTicks(marketOrderSize, currentPoolInfo, r)
                    }
                    poolCache = new Pool(tokenA, tokenB, poolFee, currentPoolInfo.sqrtPriceX96, currentPoolInfo.liquidity, currentPoolInfo.tickCurrent, tickDataProviderCache)
                } else if (log.topics[0] === burnFilter.topics[0] || log.topics[0] === mintFilter.topics[0]) {//burn和mint事件，导致流动性发生变化，需要重新查询Ticks
                    if (Date.now() - queryTicksTime > provider.pollingInterval) {//queryTicks返回数据很多，很耗资源，因此不轻易启动
                        console.log('处理burn和mint事件')
                        queryTicksTime = Date.now()
                        await fetchTicks(marketOrderSize, poolCache, r)
                        if (poolCache) {
                            poolCache = new Pool(tokenA, tokenB, poolFee, poolCache.sqrtPriceX96, poolCache.liquidity, poolCache.tickCurrent, tickDataProviderCache)
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
