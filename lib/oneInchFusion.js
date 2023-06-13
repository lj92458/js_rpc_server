import {FusionSDK, PrivateKeyProviderConnector} from '@1inch/fusion-sdk'
import {chainId, provider, wallet} from "../config.js";
import {Big, movePointRight, parseAddOrderArgs, parseBookArgs} from "../util.js";
import {Web3ProviderConnector} from "@1inch/fusion-sdk/connector/blockchain/web3-provider-connector.js";
import Web3, {providers, HttpProvider} from "web3";

//支持eth,polygon,binance ,arbitrum ,avalanche,optimism,fantom,gnosis
export const sdk = new FusionSDK({
    url: 'https://fusion.1inch.io',
    network: chainId,
    //下面是BlockchainProviderConnector类型，有PrivateKeyProviderConnector和Web3ProviderConnector两种实现
    blockchainProvider: new PrivateKeyProviderConnector(wallet.privateKey, new Web3(provider.getBaseUrl())), // new Web3ProviderConnector(new Web3(new HttpProvider(provider.getBaseUrl()))),
    //httpProvider:  //HttpProviderConnector类型,默认 axios
})

/**
 * 查询各种处于拍卖状态的挂单。什么币都有
 * @param page
 * @param limit
 * @return {Promise<ActiveOrdersResponse>}
 */
export async function getActiveOrders(page, limit) {
    try {
        return await sdk.getActiveOrders({page, limit})
    } catch (e) {
        console.error(new Date().toLocaleString() + ' getActiveOrders()异常：', e.stack || e)
        throw e
    }
}

/**
 * 获取市场行情。这个跟Aggregation结果完全一致，因此没必要用
 * @param coinPair 格式：goods-money
 * @param goodsAmount 浮点数
 * @param moneyAmount 浮点数
 * @return {Promise<{asks,bids}>}
 */
export async function getOrderBookFusion(coinPair, goodsAmount, moneyAmount) {
    try {
        const [goodsToken, moneyToken] = parseBookArgs(coinPair)
        let asks, bids
        //获取asks
        let data = await sdk.getQuote({
            fromTokenAddress: moneyToken.address,
            toTokenAddress: goodsToken.address,
            amount: movePointRight(moneyAmount, moneyToken.decimals)
        })
        let goodsPrice = Big(data.fromTokenAmount).div(data.toTokenAmount).div(10 ** (moneyToken.decimals - goodsToken.decimals)).toFixed(6)
        asks = [[
            goodsPrice,
            Big(moneyAmount).div(goodsPrice).toFixed(6), // Big(data.toTokenAmount).div(goodsToken.decimals).toFixed(6),
        ]]

        //获取bids
        data = await sdk.getQuote({
            fromTokenAddress: goodsToken.address,
            toTokenAddress: moneyToken.address,
            amount: movePointRight(goodsAmount, goodsToken.decimals)
        })
        bids = [[
            Big(data.toTokenAmount).div(data.fromTokenAmount).div(10 ** (moneyToken.decimals - goodsToken.decimals)).toFixed(6),
            goodsAmount + '', // Big(data.fromTokenAmount).div(goodsToken.decimals).toFixed(6),
        ]]

        return {asks, bids}
    } catch (e) {
        console.error(new Date().toLocaleString() + ' getOrderBookFusion()异常：', e.stack || e)
        throw e
    }
}

/**
 * 用1inch的fusion功能下单。下单过程为：创建FusionOrder并提交。这种下单方式，会被拍卖。这个跟Aggregation结果完全一致，因此没必要用
 * @param coinPair
 * @param orderType
 * @param price
 * @param volume
 * @param maxWaitSeconds
 * @param gasPriceGwei
 * @param slippage
 * @return {Promise<{orderId, nonce, hash}>}
 */
export async function addOrderFusion(coinPair, orderType, price, volume, maxWaitSeconds, gasPriceGwei, slippage) {
    console.log('addOrderFusion: ' + JSON.stringify(arguments))
    try {
        const [tokenIn, tokenOut, amountIn, amountOut] = parseAddOrderArgs(coinPair, orderType, price, volume);
        //placeOrder返回值OrderInfo的结构：{order: LimitOrderV3Struct; signature: string; quoteId: string;  orderHash: string;}
        //其中LimitOrderV3Struct的结构是 { salt: string; makerAsset: string; takerAsset: string; maker: string; receiver: string; allowedSender: string; makingAmount: string; takingAmount: string; offsets: string; interactions: string;};
        //placeOrder会调用createOrder来创建FusionOrder，然后submitOrder，并返回LimitOrderV3Struct
        let orderInfo = await sdk.placeOrder({//placeOrder会createOrder并submitOrder
            fromTokenAddress: tokenIn.address, // WETH
            toTokenAddress: tokenOut.address, // USDC
            amount: movePointRight(amountIn, tokenIn.decimals), // ETH
            walletAddress: wallet.address,
        })
        return {
            orderId: orderInfo.orderHash,
            nonce: null,
            hash: orderInfo.orderHash
        }

    } catch (e) {
        console.error(new Date().toLocaleString() + ' addOrderFusion异常：', e.stack || e)
        throw e
    }
}


/**
 * 做市商提交一个订单，用来做市
 * @return {void}
 * @constructor
 */
export async function CreatingFusionOrder() {

}