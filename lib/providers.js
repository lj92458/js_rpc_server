import {BigNumber, ethers} from 'ethers'
import {SupportedChainId} from '@uniswap/sdk-core'
import {Environment} from './constant.js'
import {logHead} from '../util.js'


import {chainId, env, initWallet, provider} from '../config.js'

const mainnetProvider = provider
export const wallet = initWallet(provider)

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
        console.log(e)
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
 * @param gasPriceGwei{number|string}
 * @returns {Promise<{orderId, nonce, hash}>}
 */
export async function sendTransactionByWallet(transactionRequest, maxWaitSeconds, gasPriceGwei) {
    let tranId = Date.now()
    let gasLimit = 250000

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
        hash: transactionReceipt.hash,
        orderId: transactionReceipt.hash,
    }
}

/**
 * 辅助智能合约的调用.(通用的底层调用，不一定是uniswap啊)
 * @param transactionRequest{TransactionRequest}
 * @param gasPriceGwei {string|number} gas价格，单位：Gwei
 * @param gasLimit {Number} gas数量限制
 * @param beginTime{Number}
 * @param transId 交易编号，用来记录日志
 * @param maxWaitSeconds {Number}
 * @param nonce
 * @returns {Promise<string|(boolean|ethers.providers.TransactionResponse|*)[]>}
 */
async function helpSendTrans(transactionRequest, gasPriceGwei, gasLimit, beginTime, transId, maxWaitSeconds, nonce) {
    transactionRequest.nonce = nonce
    transactionRequest.gasPrice = ethers.utils.parseUnits((gasPriceGwei + 5) + '', "gwei")
    transactionRequest.gasLimit = gasLimit
    if (transactionRequest.value) {
        transactionRequest.value = BigInt(transactionRequest.value.toString())
    }
    console.log(new Date().toLocaleString() + ': call sendTransaction')
    const transactionResponse = await wallet.sendTransaction(transactionRequest)
    console.info(`${logHead(transId)}发送交易耗时：${Date.now() - beginTime},nonce:${transactionResponse.nonce}`)
    //等待打包
    let packSucceed = true
    let transactionReceipt = await provider.waitForTransaction(
        transactionResponse.hash,
        1,
        maxWaitSeconds * 1000
    ).catch(err => {
        console.info(logHead(transId) + JSON.stringify(err) + "。提高手续费，重新发送交易，覆盖之前的交易")
        packSucceed = false
    })
    if (packSucceed) {
        console.info(`${logHead(transId)}waitForTransaction耗时：${Date.now() - beginTime},confirmations:${transactionReceipt.confirmations},gasUsed:${transactionReceipt.gasUsed}`)
        //交易被打包，不意味着合约调用成功。合约内部会抛出某种异常，也算打包成功。可以用https://api.etherscan.io/api查询合约执行状态。查出来又能怎么样呢？
    }
    return [packSucceed, transactionResponse, transactionReceipt]
}