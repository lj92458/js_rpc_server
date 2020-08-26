const ethers = require('ethers')
const uniswapSDK = require('@uniswap/sdk')


function bigNumToFloat(bigNum, decimals) {
    if (bigNum._hex) {
        let str = movePointLeft(bigNum.toString(), decimals)
        return str
    } else {
        throw Error("_hex属性不存在：" + bigNum)
    }
}

//把整数变成小数：往左移动小数点
function movePointLeft(str, num) {
    let result
    if (num >= str.length) {
        result = ("0.") + "0".repeat(num - str.length) + str
    } else {
        result = str.substr(0, str.length - num) + "." + str.substr(str.length - num)
    }
    return result.replace(/0+$/, "0")

}

//把小数变成整数：往右移动小数点
function movePointRight(str, num) {
    str += ""
    let index = str.indexOf(".")
    if (index === -1) {
        str += "."
    }
    let strArr = str.split(".")
    let result
    if (num >= strArr[1].length) {
        result = (strArr[0] + strArr[1]) + "0".repeat(num - strArr[1].length)
    } else {
        result = strArr[0] + strArr[1].substr(0, num)
    }
    return result.replace(/^0+/, "")
}

//返回移动后的值，以及移动的位数[str,num]
function movePointRight2(value) {
    let str = value + ""
    let index = str.indexOf(".")
    if (index === -1) {
        return [str, 0]
    } else {
        let num = str.length - index - 1
        return [movePointRight(str, num), num]
    }
}

//没用上
function adjustGasPrice(gasPrice) {
    let percent
    if (gasPrice < 10_000_000_000) {
        percent = 100 / 100
    } else if (gasPrice < 95_000_000_000) {
        percent = 88 / 100
    } else {
        percent = 83 / 100
    }
    return parseInt("" + (gasPrice * percent))
}

function doubleToPersent(value) {
    const [str, num] = movePointRight2(value)
    return new uniswapSDK.Percent(str, movePointRight("1", num))

}

//console.log(JSON.stringify(doubleToPersent("12.333")))
//console.log(adjustGasPrice(ethers.BigNumber.from("95000000000")))

exports.bigNumToFloat = bigNumToFloat
exports.movePointRight2 = movePointRight2
exports.movePointRight = movePointRight
exports.adjustGasPrice = adjustGasPrice
exports.doubleToPersent = doubleToPersent

