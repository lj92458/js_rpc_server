import {IERC20} from './lib/constant.js'
import {Contract, utils,} from 'ethers'
import {provider, tokens, nativeToken} from './config.js'
import {bigNumToFloat} from './util.js'
import assert from 'assert'

/**
 * 查询token余额
 * @param ethAddress {string} 以太坊地址
 * @param symbolArr {string[]} 货币符号数组
 * @return 复杂对象组成的数组
 */
export function queryTokenBalance(ethAddress, symbolArr) {
    ethAddress = utils.getAddress(ethAddress)//把格式变成包含大小写字母的，免得提示unchecksum address
    let promiseArr = []
    let tokenObjArr = []
    for (let symbol of symbolArr) {
        symbol = symbol.toLowerCase()
        let tokenObj = tokens[symbol].wrapped
        assert(tokenObj, "token 不存在：" + symbol)
        tokenObjArr.push(tokenObj)
        if (symbol === nativeToken) {
            promiseArr.push(provider.getBalance(ethAddress))
        } else {
            let contractERC20 = new Contract(tokenObj.address, IERC20.abi, provider)
            promiseArr.push(contractERC20.balanceOf(ethAddress))
        }
    }//end for
    try {
        return Promise.all(promiseArr).then((objArr) => {
            let accountArr = []
            for (let i = 0; i < symbolArr.length; i++) {
                accountArr.push({
                    currency: symbolArr[i],
                    available: bigNumToFloat(objArr[i], tokenObjArr[i].decimals), //活动资金
                    hold: "0" //冻结资金
                })
            }
            return accountArr
        })
    } catch (e) {
        console.error('queryTokenBalance异常：', e.stack || e)
        throw e
    }
}


