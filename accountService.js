import {IERC20} from './lib/constant'
const ethers = require('ethers')
const config = require('./config')
const util = require("./util")
import assert from 'assert'
/**
 * 查询token余额
 * @param ethAddress 以太坊地址
 * @param symbolArr 货币符号数组
 * @return 复杂对象组成的数组
 */
function queryTokenBalance(ethAddress, symbolArr) {
    ethAddress = ethers.getAddress(ethAddress)//把格式变成包含大小写字母的，免得提示unchecksum address
    let promiseArr = []
    let tokenObjArr = []
    for (let symbol of symbolArr) {
        symbol = symbol.toLowerCase()
        let tokenObj = config.tokens[symbol].wrapped
        assert(tokenObj,"token 不存在：" + symbol)
        tokenObjArr.push(tokenObj)
        if (symbol === "eth") {
            promiseArr.push(config.provider.getBalance(ethAddress))
        } else {
            let contractERC20 = new ethers.Contract(tokenObj.address, IERC20.abi, config.provider)
            promiseArr.push(contractERC20.balanceOf(ethAddress))
        }
    }//end for

    return Promise.all(promiseArr).then((objArr) => {
        let accountArr = []
        for (let i = 0; i < symbolArr.length; i++) {
            accountArr.push({
                currency: symbolArr[i],
                available: util.bigNumToFloat(objArr[i], tokenObjArr[i].decimals),
                hold: "0"
            })
        }

        return accountArr
    })
}


exports.queryTokenBalance = queryTokenBalance
