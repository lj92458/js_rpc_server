const uniswapSDK = require('@uniswap/sdk')
const IUniswapV2Pair = require('@uniswap/v2-core/build/IUniswapV2Pair.json')
const IUniswapV2ERC20 = require('@uniswap/v2-core/build/IUniswapV2ERC20.json')
const Contracts = require('@ethersproject/contracts')
const config = require('./config')
const util = require("./util")

/**
 * 查询token余额
 * @param ethAddress 以太坊地址
 * @param symbolArr 货币符号数组
 * @return 复杂对象组成的数组
 */
 function queryTokenBalance(ethAddress, symbolArr) {
    let promiseArr = []
    let tokenObjArr = []
    for (let symbol of symbolArr) {
        symbol=symbol.toLowerCase()
        let tokenObj = config.tokens[symbol]
        if (!tokenObj) {
            throw Error("token 不存在：" + symbol)
        }
        tokenObjArr.push(tokenObj)
        if (symbol === "eth") {
            promiseArr.push(config.provider.getBalance(ethAddress))
        } else {
            let contractERC20 = new Contracts.Contract(tokenObj.address, IUniswapV2ERC20.abi, config.provider)
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