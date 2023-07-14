import {BigNumber, ethers} from 'ethers'
import {
    Environment,
    MAX_FEE_PER_GAS_GWEI,
    MAX_PRIORITY_FEE_PER_GAS_GWEI,
    smartContractWalletAddress
} from './constant.js'
import {logHead, movePointRight} from '../util.js'


import {env, initWallet, provider, smartContractWallet, useSmartContractWallet} from '../config.js'

const mainnetProvider = provider
export const wallet = await initWallet(provider)

let walletExtensionAddress = null //浏览器插件钱包的地址


export class TransactionState {
    static Failed = 'Failed'
    static New = 'New'
    static Rejected = 'Rejected'
    static Sending = 'Sending'
    static Sent = 'Sent'
}

// Provider and Wallet Functions

export function getMainnetProvider() {
    return mainnetProvider
}

export function getProvider() {
    return provider
}

export function getWalletAddress() {
    return env === Environment.WALLET_EXTENSION
        ? walletExtensionAddress
        : wallet.address
}

/**
 * 通用的智能合约调用，不一定是uniswap的swap啊
 * @param transactionRequest {ethers.providers.TransactionRequest}
 * @returns {Promise<string>}
 */
export async function sendTransaction(transactionRequest) {
    if (env === Environment.WALLET_EXTENSION) {
        return sendTransactionViaExtension(transactionRequest)
    } else {
        if (transactionRequest.value) {
            transactionRequest.value = BigNumber.from(transactionRequest.value)
        }
        return sendTransactionViaWallet(transactionRequest)
    }
}


export async function connectBrowserExtensionWallet() {
    if (!window.ethereum) {
        return null
    }
    const {ethereum} = window
    const provider = new ethers.providers.Web3Provider(ethereum)
    const accounts = await provider.send('eth_requestAccounts', [])
    if (accounts.length !== 1) {
        return
    }
    walletExtensionAddress = accounts[0]
    return walletExtensionAddress
}


/**
 * 通过浏览器插件，发送交易
 * @param transactionRequest {ethers.providers.TransactionRequest}
 * @returns {Promise<string>}
 */
async function sendTransactionViaExtension(transactionRequest) {
    try {
        const receipt = await provider?.send(
            'eth_sendTransaction',
            [transactionRequest]
        )
        if (receipt) {
            return TransactionState.Sent
        } else {
            return TransactionState.Failed
        }
    } catch (e) {
        console.log(new Date().toLocaleString() + ' sendTransactionViaExtension异常：', e.stack || e)
        return TransactionState.Rejected
    }
}

/**
 * 通过wallet对象来发送交易。不建议使用这个，因为里面的while循环可能长期无法结束
 * @param transactionRequest { ethers.providers.TransactionRequest}
 * @returns {Promise<string>}
 */
async function sendTransactionViaWallet(transactionRequest) {
    if (transactionRequest.value) {
        transactionRequest.value = BigNumber.from(transactionRequest.value)
    }
    const txRes = await wallet.sendTransaction(transactionRequest)

    let receipt = null
    const provider = getProvider()
    if (!provider) {
        return TransactionState.Failed
    }
    while (receipt === null) {
        try {
            receipt = await provider.getTransactionReceipt(txRes.hash)
        } catch (e) {
            console.log(`Receipt error:`, e)
            break
        }
    }
    // Transaction was successful if status === 1
    if (receipt) {
        return TransactionState.Sent
    } else {
        return TransactionState.Failed
    }
}

/**
 * 通用的智能合约调用，返回更详细的信息。(会尝试3次，不断提高gas费)
 * @param transactionRequest
 * @param maxWaitSeconds
 * @param gasPriceGwei{number|string} 如果有了maxFeePerGas或maxPriorityFeePerGas，那么gasPriceGwei会被忽略
 * @returns {Promise<{orderId, nonce, hash}>} 【注意：transactionReceipt中的交易哈希叫transactionHash;而transaction，transactionRequest，transactionResponse中的交易哈希叫做hash 】
 */
export async function sendTransactionByWallet(transactionRequest, maxWaitSeconds, gasPriceGwei) {
    //2023-7-4 如果系统配置成智能合约钱包,那么就把普通调用，替换成智能合约对multicalll的调用
    if (useSmartContractWallet && transactionRequest.to !== smartContractWalletAddress) {
        transactionRequest = await smartContractWallet.populateTransaction.aggregate3ValueSingle(
            {
                target: transactionRequest.to,
                allowFailure: false,
                value: transactionRequest.value || 0,
                callData: transactionRequest.data
            }
            , {value: 0}
        )
        transactionRequest = fillTranRequest(transactionRequest, null, null, null, null)
    }

    let tranId = Date.now()
    let gasLimit = 10000000

    let [packSucceed, transactionResponse, transactionReceipt] = await helpSendTrans(transactionRequest, gasPriceGwei,
        gasLimit, Date.now(), tranId, maxWaitSeconds, null)
    //如果打包超时，就提高gas费(覆盖原有交易)
    if (!packSucceed) {
        [packSucceed, transactionResponse, transactionReceipt] = await helpSendTrans(transactionRequest, Math.round(gasPriceGwei * 1.13),
            gasLimit, Date.now(), tranId, maxWaitSeconds, transactionResponse.nonce)
    }
    //如果还超时，就提高gas费(覆盖原有交易。一般不太可能出现这种情况)
    if (!packSucceed) {
        [packSucceed, transactionResponse, transactionReceipt] = await helpSendTrans(transactionRequest, Math.round(gasPriceGwei * 1.2),
            gasLimit, Date.now(), tranId, maxWaitSeconds, transactionResponse.nonce)
    }
    return {
        nonce: transactionResponse.nonce,
        hash: transactionReceipt.transactionHash,
        orderId: transactionReceipt.transactionHash,
        //events: transactionReceipt.events
    }
}

/**
 * 辅助智能合约的调用.(通用的底层调用，不一定是uniswap啊)
 * @param tranReq{TransactionRequest}
 * @param gasPriceGwei {string|number} gas价格，单位：Gwei
 * @param gasLimit {Number} gas数量限制
 * @param beginTime{Number}
 * @param transId 交易编号，用来记录日志
 * @param maxWaitSeconds {Number}
 * @param nonce
 * @returns {Promise<string|(boolean|ethers.providers.TransactionResponse|*)[]>}
 */
async function helpSendTrans(tranReq, gasPriceGwei, gasLimit, beginTime, transId, maxWaitSeconds, nonce) {
    tranReq.nonce = nonce
    tranReq.gasPrice = tranReq.type || tranReq.maxFeePerGas || tranReq.maxPriorityFeePerGas ? null : ethers.utils.parseUnits(gasPriceGwei + '', "gwei")
    tranReq.gasLimit = gasLimit
    if (tranReq.value) {
        tranReq.value = BigInt(tranReq.value.toString())
    }
    console.log(new Date().toLocaleString() + ': call sendTransaction')
    const transactionResponse = await wallet.sendTransaction(tranReq)
    console.info(`${logHead(transId)}发送交易耗时：${Date.now() - beginTime},nonce:${transactionResponse.nonce}`)
    //等待打包
    let packSucceed = true
    let transactionReceipt = await provider.waitForTransaction(
        transactionResponse.hash,//注意：transactionReceipt中的交易哈希叫transactionHash;而transaction，transactionRequest，transactionResponse中的交易哈希叫做hash
        1,
        maxWaitSeconds * 1000
    ).catch(err => {
        console.info(logHead(transId) + JSON.stringify(err) + "。提高手续费，重新发送交易，覆盖之前的交易")
    })
    if (packSucceed && transactionReceipt.transactionHash) {//注意：transactionReceipt中的交易哈希叫transactionHash;而transaction，transactionRequest，transactionResponse中的交易哈希叫做hash
        console.debug(`${logHead(transId)}waitForTransaction耗时：${Date.now() - beginTime},transactionReceipt:${JSON.stringify(transactionReceipt)}`)
        //交易被打包，不意味着合约调用成功。合约内部会抛出某种异常，也算打包成功。可以用https://api.etherscan.io/api查询合约执行状态。查出来又能怎么样呢？
        return [true, transactionResponse, transactionReceipt]
    } else {
        console.error(`异常：packSucceed=${packSucceed} transactionReceipt:${JSON.stringify(transactionReceipt)}`)
        return [false, transactionResponse, transactionReceipt]
    }

}

/**
 * 统一构造TranRequest对象，这样能统一管理 maxFeePerGas、type等高级特性
 * @param transactionReq  如果transactionReq为空，则data,to,value,from最好要填写一下. 如果提供了transactionReq，就不需要data,to,value,from.
 * @param data 可选. 会覆盖掉transactionReq.data
 * @param to 消息接收方. 会覆盖掉transactionReq.to
 * @param value 可选. 会覆盖掉transactionReq.value
 * @param from 大多情况下不需要填写. 会覆盖掉transactionReq.from
 * @return {{data, maxPriorityFeePerGas: number, from, to, maxFeePerGas: number, value}}
 */
export function fillTranRequest(transactionReq, data = null, to = null, value = null, from = null) {
    return {
        data: data ?? transactionReq?.data,
        to: to ?? transactionReq?.to,
        value: value ?? transactionReq?.value,
        from: from ?? transactionReq?.from,
        maxFeePerGas: movePointRight(MAX_FEE_PER_GAS_GWEI, 9), //这些高级特性，最好不要有。因为很多链不支持。
        maxPriorityFeePerGas: movePointRight(MAX_PRIORITY_FEE_PER_GAS_GWEI, 9),
        //type: 0, //  EIP-2718规定的类型。type=0,意思是强制不使用maxFeePerGas.  如果type=1或2, 或maxFeePerGas不为空，或maxPriorityFeePerGas不为空，那么gasPrice就失效

    }
}