import {IERC20, weth10ABI, weth9ABI} from './lib/constant.js'
import {Contract, utils,} from 'ethers'
import {
    maxNativeToken,
    minNativeToken,
    nativeToken,
    provider,
    supportWeth10,
    tokens,
    wallet,
    whiteList
} from './config.js'
import {bigNumToFloat, movePointRight} from './util.js'
import assert from 'assert'
import {fillTranRequest, sendTransactionByWallet} from "./lib/providers.js";

/**
 * 查询token余额
 * @param ethAddress {string} 以太坊地址
 * @param symbolArr {string[]} 货币符号数组
 * @return 复杂对象组成的数组
 */
export async function queryTokenBalance(ethAddress, symbolArr) {
    //console.log('queryTokenBalance:' + ethAddress)
    ethAddress = utils.getAddress(ethAddress)//把格式变成包含大小写字母的，免得提示unchecksum address
    let promiseArr = []
    let tokenObjArr = []
    for (let symbol of symbolArr) {
        symbol = symbol.toLowerCase()
        let tokenObj = tokens[symbol]?.wrapped || tokens['w' + symbol]?.wrapped
        assert(tokenObj, "token 不存在：" + symbol)
        tokenObjArr.push(tokenObj)
        if (symbol === nativeToken) {//nativeToken不属于智能合约，所以只能调用getBalance
            promiseArr.push(provider.getBalance(ethAddress))
        } else {
            let contractERC20 = new Contract(tokenObj.address, IERC20.abi, provider)
            promiseArr.push(contractERC20.balanceOf(ethAddress))
        }
    }//end for
    try {
        console.log(new Date().toLocaleString() + `: call contractERC20 ${promiseArr.length} times`)
        let objArr = await Promise.all(promiseArr)
        let accountArr = []
        for (let i = 0; i < symbolArr.length; i++) {
            accountArr.push({
                currency: symbolArr[i],
                available: bigNumToFloat(objArr[i], tokenObjArr[i].decimals), //活动资金
                hold: "0" //冻结资金
            })
        }
        return accountArr
    } catch (e) {
        console.error(new Date().toLocaleString() + ' queryTokenBalance异常：', e.stack || e)
        throw e
    }
}

/**
 * 发送代币。如果要发送eth，而我只有weth，就需要把weth变成eth再发送(调用合约的withdraw函数或withdrawTo)
 * @param symbol{string} 要发送什么token
 * @param address 接收方地址。注意安全，只对白名单里面的地址有效
 * @param amount{number} 金额
 * @param needWrap{boolean} 【仅针对eth和weth有意义，对usdc无意义】是否需要eth和weth之间转换。如果需要，当symbol是eth时，会自动把weth转成eth并发送;当symbol是weth时，会自动把eth转成weth并发送.
 * @param maxWaitSeconds{number}
 * @param gasPriceGwei{string}
 * @return {Promise<{orderId, nonce, hash}>}
 */
export async function sendToken(symbol, address, amount, needWrap, maxWaitSeconds, gasPriceGwei) {
    assert(whiteList.includes(address.toLowerCase()), '地址没在whiteList: ' + address)
    await checkNativeToken(minNativeToken, maxNativeToken, maxWaitSeconds, gasPriceGwei)

    console.log('sendToken: ' + JSON.stringify(arguments))
    symbol = symbol.toLowerCase()
    let tokenObj = tokens[symbol]?.wrapped || tokens['w' + symbol]?.wrapped
    assert(tokenObj, "token 不存在：" + symbol)
    let contractERC20 = new Contract(tokenObj.address, IERC20.abi, provider)
    let contractWeth10 = new Contract(tokenObj.address, weth10ABI.abi, provider)
    let contractWeth9 = new Contract(tokenObj.address, weth9ABI.abi, provider)
    let firstStepResult = null;
    if (symbol === nativeToken) {
        if (needWrap) {//把weth转成eth并发送(调用weth10的withdrawTo可完成这两步，但是weth9没有withdrawTo，只好调用withdraw然后发送)
            if (supportWeth10) {//withdrawTo 【用不上，因为币安不支持合约调用形式的转账】
                const transaction = await contractWeth10.populateTransaction.withdrawTo(address, movePointRight(amount, tokenObj.decimals))
                return await sendTransactionByWallet({...fillTranRequest(transaction),}, maxWaitSeconds, gasPriceGwei)
            } else {//withdraw且sendETH
                const transaction = await contractWeth9.populateTransaction.withdraw(movePointRight(amount, tokenObj.decimals))
                firstStepResult = await sendTransactionByWallet({...fillTranRequest(transaction),}, maxWaitSeconds, gasPriceGwei)
                if (firstStepResult?.hash) {//sendETH
                    return await helpSendToken(null, address, amount, tokenObj.decimals, maxWaitSeconds, gasPriceGwei)
                }
            }
        } else {//sendETH
            return await helpSendToken(null, address, amount, tokenObj.decimals, maxWaitSeconds, gasPriceGwei)
        }
    } else if (symbol === 'w' + nativeToken) {//weth
        if (needWrap) {//把eth转成weth并发送(调用weth10的depositTo可完成这两步,但是weth9没有depositTo，只好调用deposit和transfer)
            if (supportWeth10) {//depositTo 【用不上，因为币安不支持合约调用形式的转账】
                const transaction = await contractWeth10.populateTransaction.depositTo(address)
                let result = await sendTransactionByWallet(
                    {...fillTranRequest(transaction, null, null, movePointRight(amount, tokenObj.decimals)),}, maxWaitSeconds, gasPriceGwei)
                console.log(new Date().toLocaleString() + ' depositTo给1个参数，正常')
                return result

            } else {//deposit且transfer
                const transaction = await contractWeth9.populateTransaction.deposit();
                firstStepResult = await sendTransactionByWallet(
                    {...fillTranRequest(transaction, null, null, movePointRight(amount, tokenObj.decimals)),}, maxWaitSeconds, gasPriceGwei);
                console.log(new Date().toLocaleString() + ' deposit给0个参数，正常')
                if (firstStepResult?.hash) {//sendETH
                    return await helpSendToken(contractERC20, address, amount, tokenObj.decimals, maxWaitSeconds, gasPriceGwei)
                }
            }
        } else {//调用send
            return await helpSendToken(contractERC20, address, amount, tokenObj.decimals, maxWaitSeconds, gasPriceGwei)
        }
    } else {//例如usdc,直接调用erc20.transfer
        return await helpSendToken(contractERC20, address, amount, tokenObj.decimals, maxWaitSeconds, gasPriceGwei)
    }
    throw new Error('由于上一步出错，helpSendToken没有执行. 上一步返回的结果：' + JSON.stringify(firstStepResult))

}

async function helpSendToken(contractERC20, toAddress, amount, decimals, maxWaitSeconds, gasPriceGwei) {
    try {
        if (contractERC20) {
            const transaction = await contractERC20.populateTransaction.transfer(toAddress, movePointRight(amount, decimals))
            return await sendTransactionByWallet({...fillTranRequest(transaction),}, maxWaitSeconds, gasPriceGwei)
        } else {
            return await sendTransactionByWallet({...fillTranRequest(null, null, toAddress, movePointRight(amount, decimals)),}, maxWaitSeconds, gasPriceGwei)
        }
    } catch (e) {
        console.error(e)
        return null;
    }
}

/**
 * 接收别人发来的代币。本来是不用接收的，但是如果收到eth，需要调用合约的deposit函数转换成weth呢？
 * 参考 https://binance-docs.github.io/apidocs/spot/cn/#user_data-7
 * @param symbol{string} 要接收什么token
 * @param txId{string} 交易哈希
 * @param amount{number} 金额
 * @param needWrap{boolean} 是否需要eth和weth之间转换。如果需要，当symbol是eth时，会自动把eth转成weth;当symbol是weth时，会自动把weth转成eth.
 * @param maxWaitSeconds{number}
 * @param gasPriceGwei{string}
 * @return {Promise<number>} 网络确认数量，-1表示异常
 */
export async function receiveToken(symbol, txId, amount, needWrap, maxWaitSeconds, gasPriceGwei) {
    console.log('receiveToken: ' + JSON.stringify(arguments))
    await checkNativeToken(minNativeToken, maxNativeToken, maxWaitSeconds, gasPriceGwei)

    symbol = symbol.toLowerCase()
    let confirmNum = 1 //等待几个网络确认
    let tokenObj = tokens[symbol]?.wrapped || tokens['w' + symbol]?.wrapped
    assert(tokenObj, "token 不存在：" + symbol)
    try {
        let transactionReceipt = await provider.waitForTransaction(txId, confirmNum, maxWaitSeconds)
        let confirmNumResult = transactionReceipt?.confirmations ?? 0
        if (needWrap && transactionReceipt?.transactionHash) {//如果需要转换
            let contractWeth9 = new Contract(tokenObj.address, weth9ABI.abi, provider)
            if (symbol === nativeToken) {//eth转成weth(调用deposit)
                const transaction = await contractWeth9.populateTransaction.deposit()
                await sendTransactionByWallet({...fillTranRequest(transaction, null, null, movePointRight(amount, tokenObj.decimals)),}, maxWaitSeconds, gasPriceGwei)
            } else if (symbol === 'w' + nativeToken) {//weth转成eth(调用widthdraw)
                const transaction = await contractWeth9.populateTransaction.widthdraw(movePointRight(amount, tokenObj.decimals));
                await sendTransactionByWallet({...fillTranRequest(transaction),}, maxWaitSeconds, gasPriceGwei);
            }
        }
        return confirmNumResult
    } catch (e) {
        console.error(e)
        return -1;
    }
}

/**
 * 当eth数量少于0.001时，自动调整到0.05
 * @return {Promise<void>}
 */
async function checkNativeToken(minAmount, maxAmount, maxWaitSeconds, gasPriceGwei) {
    let ethBalance = utils.formatEther(await wallet.getBalance())
    console.log('当前eth余额' + ethBalance)
    if (ethBalance < minAmount) {
        console.log('eth数量小于' + minAmount + ', 开始从weth转入' + maxAmount)
        let weth = tokens['w' + nativeToken]
        let contractWeth9 = new Contract(weth.address, weth9ABI.abi, provider)
        const transaction = await contractWeth9.populateTransaction.widthdraw(movePointRight(maxAmount, weth.decimals));
        await sendTransactionByWallet({...fillTranRequest(transaction),}, maxWaitSeconds, gasPriceGwei);
        console.log('成功widthdraw ' + maxAmount + ' weth')
    }
}




