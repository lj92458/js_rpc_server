import IUniswapV3PoolABI
    from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert {type: 'json'}
import {Pool, Tick, TICK_SPACINGS} from '@uniswap/v3-sdk'
import {Contract} from 'ethers'
import TickLensABI
    from '@uniswap/v3-periphery/artifacts/contracts/lens/TickLens.sol/TickLens.json' assert {type: 'json'}
import {Token} from '@uniswap/sdk-core'
import {provider} from '../config.js'
import {tickLens, uniswapV3Factory} from './constant.js'
import {MyTickListDataProvider} from "./MyTickListDataProvider.js";


/**
 * 资金池信息
 *   token0: {string}
 *   token1: {string}
 *   fee: {number} 500表示百万分之500，也就是0.0005，也就是0.05%
 *   tickSpacing: {number}
 *   liquidity: {ethers.BigNumber}
 *   sqrtPriceX96: {ethers.BigNumber} 池的当前价格作为 sqrt(token1/token0)的Q64.96格式，也叫做sqrtRatioX96
 *   currentTick: {number} 当前市场价格在哪个价格区间
 */
export class PoolInfo {
    token0
    token1
    fee
    tickSpacing
    liquidity
    sqrtPriceX96
    currentTick

    constructor(token0, token1, fee, tickSpacing, liquidity, sqrtPriceX96, currentTick) {
        this.token0 = token0
        this.token1 = token1
        this.fee = fee
        this.tickSpacing = tickSpacing
        this.liquidity = liquidity
        this.currentTick = currentTick
        this.sqrtPriceX96 = sqrtPriceX96
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
    const poolContract = new Contract(Pool.getAddress(tokenA, tokenB, poolFee, null, uniswapV3Factory), IUniswapV3PoolABI.abi, provider)

    const [liquidity, slot0] = //token0, token1, fee, tickSpacing这些都不用查。为了节省调用次数
        await Promise.all([
            poolContract.liquidity(),//bigNumber
            poolContract.slot0(),
        ])
    let [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    return new PoolInfo(token0, token1, poolFee, TICK_SPACINGS[poolFee], liquidity, slot0[0], slot0[1])
}

/**
 * 读取并返回Pool对象
 * @param provider
 * @param tokenA{Token}
 * @param tokenB{Token}
 * @param poolFee{Number}
 * @return {Promise<Pool>}
 */
export async function getPool(provider, tokenA, tokenB, poolFee) {
    let poolInfo = await getPoolInfo(provider, tokenA, tokenB, poolFee)
    return new Pool(tokenA, tokenB, poolInfo.fee, poolInfo.sqrtPriceX96, poolInfo.liquidity, poolInfo.currentTick)
}

//查询tick,并创建新pool对象
let queryTicksCount = 0 //查询Ticks多少次了。每查询10次，才真正的查询一次。其它时候，直接获取缓存
let tickDataProviderCache = null
let bytesCache = 0 //除了获取当前字节，还应该左右各获取多少字节？
let addressCache = ''
let currentByteIndexCache = 0

/**
 * 根据旧pool，创建新pool,并填充足够数量的tick。
 * tick在bitmap中是按从小到大的顺序排列的。但是TickLen.getPopulatedTicksInWord返回的却是倒序的，需要再颠倒过来。
 * @param pool {Pool} 现有的pool
 * @return {Promise<Pool>} 包含足够ticks的新pool
 */
export async function creatPoolWithticksFromPool(pool) {
    let bytes = pool.fee === 500 ? 2 : 1
    /*
    每查询10次tick，才真正的从网上查询一次，其它时候直接获取缓存。
    缓存会失效吗？【会的】。1.记住currentTick所在字节，如果接下来它变到其它字节，就应该让缓存失效。
    2.做市商对自己position的改动，也会导致缓存失效。假设30秒内，所有的position不会有改动，那么就能认为这期间缓存是有效的。
    */
    const space = 3 //每3秒调用一次本函数，每9秒真的去网上查一次,平时就用缓存应付。因为tick数据就算不能实时同步，也只是影响到市场挂单量，而不会影响到挂单价格
    let address = Pool.getAddress(pool.token0, pool.token1, pool.fee, null, uniswapV3Factory)
    let currentByteIndex = (pool.tickCurrent / pool.tickSpacing) >> 8 //currentTick所在字节

    //如果cache失效(space能被除尽，或者价格变动导致currentByteIndex发生变化，或者pool地址发生变化)
    if (queryTicksCount++ % space === 0 || currentByteIndex !== currentByteIndexCache || addressCache !== address) {
        let promiseArr = []
        promiseArr.push(getPopulatedTicksInWord(address, currentByteIndex))
        for (let i = 0; i < bytes; i++) {
            promiseArr.push(getPopulatedTicksInWord(address, currentByteIndex + i + 1), getPopulatedTicksInWord(address, currentByteIndex - i - 1))
        }//end for
        let sortedTickArr = (await Promise.all(promiseArr)).flat().sort((tick1, tick2) => tick1.tick - tick2.tick)
        //智能合约返回的tick格式是 {tick,liquidityNet,liquidityGross}，因此要转换成v3-sdk里面的Tick格式 {index,liquidityNet,liquidityGross}
        let tickArr = []
        sortedTickArr.forEach(tick => tickArr.push(new Tick({
            index: tick.tick,
            liquidityGross: tick.liquidityGross,
            liquidityNet: tick.liquidityNet
        })))
        console.log(new Date().toLocaleString() + `: call tickLensContract ${promiseArr.length} times, tick总量${tickArr.length}`)
        tickDataProviderCache = new MyTickListDataProvider(tickArr, pool.tickSpacing)
        bytesCache = bytes
        addressCache = address
        currentByteIndexCache = currentByteIndex
    }
    return new Pool(pool.token0, pool.token1, pool.fee, pool.sqrtRatioX96, pool.liquidity, pool.tickCurrent, tickDataProviderCache)
}

/**
 * 调用tickLens合约。返回的tick数组是倒序的
 * @param address pool的地址
 * @param byteIndex 字节编号
 * @return {Promise<{tick,liquidityNet,liquidityGross}[]>} ticks
 */
async function getPopulatedTicksInWord(address, byteIndex) {
    const tickLensContract = new Contract(tickLens, TickLensABI.abi, provider)
    return await tickLensContract.getPopulatedTicksInWord(address, byteIndex)
}