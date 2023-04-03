import assert from 'assert'
import _Big from 'big.js'
import toFormat from 'toformat'
import JSBI from 'jsbi'

import {Percent} from '@uniswap/sdk-core'

export const Big = toFormat(_Big)

export function bigNumToFloat(bigNum, decimals) {
    assert(bigNum._hex, "_hex属性不存在：" + bigNum)
    return movePointLeft(bigNum.toString(), decimals)

}

/**
 * 把整数变成小数：往左移动小数点
 * @param str{Number|string}
 * @param num
 * @return {string}
 */
export function movePointLeft(str, num) {
    str += ""
    let result
    if (num >= str.length) {
        result = ("0.") + "0".repeat(num - str.length) + str
    } else {
        result = str.substring(0, str.length - num) + "." + str.substring(str.length - num)
    }
    return result.replace(/0+$/, "0")

}

/**
 * 把小数变成整数：往右移动小数点。移动之后的小数部分会被丢弃
 * @param str {Number|string}
 * @param num {Number} 移动的位数
 * @return {string} 移动后的str
 */
export function movePointRight(str, num) {
    str += ""
    if (str.indexOf(".") === -1) {
        str += "."
    }
    let strArr = str.split(".")
    let result
    if (num >= strArr[1].length) {
        result = (strArr[0] + strArr[1]) + "0".repeat(num - strArr[1].length)
    } else {
        result = strArr[0] + strArr[1].substring(0, num)
    }
    return result.replace(/^0+/, "")
}

/**
 * 返回移动后的值，以及移动的位数{str,num}
 * @param value  {Number|string}
 * @return {{str: string, num: number}|(string|number)[]}
 */
export function movePointRight2(value) {
    let str = value + ""
    let index = str.indexOf(".")
    if (index === -1) {
        return [str, 0]
    } else {
        let num = str.length - index - 1
        return {str: movePointRight(str, num), num}
    }
}

//没用上
export function adjustGasPrice(gasPrice) {
    let percent
    if (gasPrice < 10000000000) {
        percent = 100 / 100
    } else if (gasPrice < 95000000000) {
        percent = 88 / 100
    } else {
        percent = 83 / 100
    }
    return parseInt("" + (gasPrice * percent))
}

/**
 * 将小数转化成百分数
 * @param value {Number|string} 小数或字符串形式的小数
 * @returns {Percent} 百分数
 */
export function doubleToPersent(value) {
    const {str, num} = movePointRight2(value)
    return new Percent(str, movePointRight("1", num))

}

export function logHead(transId) {
    return new Date().toLocaleString() + transId + ": "
}

/**
 * 把x96形式的定点数转化成浮点数Big,例如X96, X128.
 * 转化的方式为：(x96/ 2**96)
 * @param x96Value {JSBI} x96形式的值
 * @param k {Number} 小数部分占多少位？通常有 96或128
 * @return {Big} 浮点数.
 */
export function X96ToBig(x96Value, k = 96) {

    return Big(x96Value.toString()).div(Big(2).pow(k))
}

/**
 * 把x96形式的sqrtPrice转化成浮点数形式的price,例如X96, X128.
 * 转化的方式为：(x96/ 2**96) **2
 * @param x96Value {JSBI} x96形式的值
 * @param k {Number} 小数部分占多少位？通常有 96或128
 * @return {Big} 浮点数形式的price.单位是聪、伟等最小单元
 */
export function sqrtPriceX96ToPrice(x96Value, k = 96) {
    return X96ToBig(x96Value, k).pow(2)
}

/**
 * 根据流动性、价格开方，计算资金池中某种币的数量(单位是聪、伟等最小单元).
 * x数量= L / sqrtP1,  y数量= L/sqrtP2 = L * sqrtP1
 * @param liquidity {JSBI} 流动性
 * @param sqrtPriceX96 {JSBI} token0的价格开根号
 * @param isToken0Amount {boolean} 是计算token0的数量吗。
 * @return {Big} 币数量，单位是聪、伟等最小单元
 */
export function getTokenAmount(liquidity, sqrtPriceX96, isToken0Amount) {
    let sqrtPrice = X96ToBig(sqrtPriceX96)
    //是计算token0的数量吗。如果不是，就用乘法.因为：x数量= L / sqrtP1,  y数量= L/sqrtP2 = L * sqrtP1
    if (isToken0Amount) {
        return Big(liquidity.toString()).div(sqrtPrice)
    } else {
        return Big(liquidity.toString()).times(sqrtPrice)
    }
}

/**
 * 把poolFee除以一百万，得到真实的费率
 * @param poolFee {Number} 100或500或3000或10000
 * @return {Number} 0.0001或0.0005或0.0030
 */
export function poolFeeToNumber(poolFee) {
    return Number(movePointLeft(poolFee, 6))
}