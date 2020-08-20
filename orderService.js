const uniswapSDK = require('@uniswap/sdk')
const ethers = require('ethers')
const IUniswapV2Router02 = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json')
const JSBI = require('jsbi')
const config = require('./config')
const util = require("./util")

/* ethers.io使用手册：Contract对象
调用某个智能合约，直接用address和abi构造Contractd对象。 这个对象的特性，请参考：
https://docs.ethers.io/v5/single-page/#/v5/api/contract/contract/-%23-Contract--metaclass
调用智能合约的函数，如果改变了区块链状态(需要gas)，那么该函数无法返回结果(返回的是Promise<TransactionResponse>)，
只能被Solidity event或EVM log记录日志。日志可以从transactionReceipt对象查到.
分析某个函数的特性，(例如估算gas消耗)contract.estimateGas.METHOD_NAME 参考：https://docs.ethers.io/v5/single-page/#/v5/api/contract/contract/-%23-Contract--check
*/

//===============================================================

/*  ethers.io使用手册：provider对象
估算gas价格
gasPrice = await provider.getGasPrice()
// { BigNumber: "57000000000" }
// ...often this gas price is easier to understand or
// display to the user in gwei (giga-wei, or 1e9 wei)
utils.formatUnits(gasPrice, "gwei")
// '57.0'
估算gas量
 provider.estimateGas( transaction )
 读区块链
 provider.call()
 写区块链，返回TransactionResponse（它继承了transaction）
 provider.sendTransaction( transaction ) ⇒ Promise< TransactionResponse >
 等待这个交易被打包  https://docs.ethers.io/v5/single-page/#/v5/api/providers/types/-%23-providers-TransactionResponse
 TransactionResponse.wait( [ confirmations = 1 ] ) ⇒ Promise< TransactionReceipt >
 等待某个交易TransactionResponse.hash 被打包
provider.waitForTransaction( hash [ , confirms = 1 [ , timeout ] ] )

r/s/v参数：分别代表椭圆曲线签名的三个部分： transaction.r transaction.s transaction.v
 */

const paramSet={}//去重，防止addOrder方法被莫名奇妙的重复调用
const defaultSlipage = util.doubleToPersent(config.slippage)

config.init()

function logHead(transId) {
    return new Date().toLocaleString() + transId + ": "
}

/**
 * 提交一个订单
 * @param coinPair 交易对，例如：eth-dai 格式：goods-money
 * @param orderType buy,sell
 * @param price goods价格
 * @param volume goods数量
 * @param maxWaitSeconds 在手续费不足的情况下，允许的超时时间。过了这个时间，就加速
 * @param gasPriceGwei gas价格Gwei
 * @param slippage 滑点 double
 * @return AddOrderResult 对象
 */
async function addOrder(coinPair, orderType, price, volume, maxWaitSeconds, gasPriceGwei, slippage) {
    let beginTime = new Date().getTime()

    const key=coinPair+'_'+ orderType+'_'+ price+'_'+ volume+'_'+ maxWaitSeconds+'_'+ gasPriceGwei+'_'+ slippage
        if(paramSet[key]){
            console.info(logHead(beginTime)+" 重复调用："+key)
            return null
        }else{
            console.info(logHead(beginTime)+" 首次调用："+key)
            paramSet[key]=1
        }

    //https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/UniswapV2Router02.sol
    const uniswapV2Router02 = new ethers.Contract("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", IUniswapV2Router02.abi, config.wallet)

    //1.构建trade
    //1.1构建route
    const [goods, money] = coinPair.toLowerCase().split("-")
    const [goodsObj, moneyObj] = [config.tokens[goods], config.tokens[money]]
    if (!goodsObj || !moneyObj) {
        throw Error("token 不存在：" + [goods, money])
    }

    const goodsToken = new uniswapSDK.Token(config.chainId, goodsObj.address, goodsObj.decimals, goodsObj.symbol)
    const moneyToken = new uniswapSDK.Token(config.chainId, moneyObj.address, moneyObj.decimals, moneyObj.symbol)
    const pair = await uniswapSDK.Fetcher.fetchPairData(goodsToken, moneyToken, config.provider)
    const goodsCurrency = goods === 'eth' ? uniswapSDK.Currency.ETHER : goodsToken
    const moneyCurrency = money === 'eth' ? uniswapSDK.Currency.ETHER : moneyToken

    const inputCurrency = orderType === "buy" ? moneyCurrency : goodsCurrency
    const outputCurrency = orderType === "buy" ? goodsCurrency : moneyCurrency
    const route = new uniswapSDK.Route([pair], inputCurrency, outputCurrency)//output必须要自己填写。
    //1.2 构建inputAmount
    const amount = inputCurrency === moneyCurrency ? price * volume : volume
    const inputAmount = inputCurrency === uniswapSDK.Currency.ETHER ?
        uniswapSDK.CurrencyAmount.ether(util.movePointRight(amount, inputCurrency.decimals))
        :
        new uniswapSDK.TokenAmount(inputCurrency, util.movePointRight(amount, inputCurrency.decimals))

    //1.3 trade
    const trade = new uniswapSDK.Trade(route, inputAmount, uniswapSDK.TradeType.EXACT_INPUT)
    //2.发送交易 .确定该调用uniswapV2Router02的哪个方法
    let allowedSlippage = slippage && slippage > 0 ? util.doubleToPersent(slippage) : defaultSlipage
    //{methodName: string  , args: (string | string[])[] , value: string}
    const swapParameters = uniswapSDK.Router.swapCallParameters(trade, {
        allowedSlippage: allowedSlippage,//滑点
        ttl: maxWaitSeconds + 10 + 80,//时间限制:秒。因为参数构造好了，不是马上发出去，而是有延迟。所以要把延迟加上
        recipient: config.wallet.address,
        feeOnTransfer: false //某些币，调用transfer/transferFrom时，会收费(对方收到金额小于我方发送的金额)
    })
    console.info(`${logHead(beginTime)}fetchPairData，耗时：${Date.now() - beginTime},methodName:${swapParameters.methodName},value:${swapParameters.value}，slippage:${allowedSlippage.toFixed(3)}%`)
    /* overrides参数：
    gasLimit?: BigNumberish | Promise<BigNumberish>;
    gasPrice?: BigNumberish | Promise<BigNumberish>;
    nonce?: BigNumberish | Promise<BigNumberish>;
    value?: BigNumberish | Promise<BigNumberish>; //PayableOverrides
    blockTag?: BlockTag | Promise<BlockTag>; //CallOverrides
    from?: string | Promise<string>; //CallOverrides
     */


    //let gasLimit = await uniswapV2Router02.estimateGas[swapParameters.methodName](...swapParameters.args, {value: swapParameters.value,})
    let gasLimit = 140000

    console.info(`${logHead(beginTime)}estimateGas耗时：${Date.now() - beginTime},sendEth(wei):${swapParameters.value},gasLimit:${gasLimit},gasPrice:${gasPriceGwei}Gwei`)
    let [packSucceed, transactionResponse, transactionReceipt] = await sendAndWait(
        uniswapV2Router02,
        swapParameters,
        gasPriceGwei,
        gasLimit,
        beginTime,
        beginTime,
        maxWaitSeconds,
        null)

    //如果打包超时，就加速
    if (!packSucceed) {
        [packSucceed, transactionResponse, transactionReceipt] = await sendAndWait(
            uniswapV2Router02,
            swapParameters,
            config.chainId === uniswapSDK.ChainId.MAINNET ?
                '' + parseInt(Number(gasPriceGwei) / 0.88) :
                '2',
            gasLimit,
            Date.now(),
            beginTime,
            40,
            transactionResponse.nonce)
    }
    //如果还超时，就继续加速（一般不太可能出现这种情况）
    if (!packSucceed) {
        console.info(`${logHead(beginTime)}还是超时，那么就继续加速`)
            [packSucceed, transactionResponse, transactionReceipt] = await sendAndWait(
            uniswapV2Router02,
            swapParameters,
            config.chainId === uniswapSDK.ChainId.MAINNET ?
                '' + parseInt(Number(gasPriceGwei) / 0.83) :
                '3',
            gasLimit,
            Date.now(),
            beginTime,
            40,
            transactionResponse.nonce)
    }
    return {
        nonce: transactionResponse.nonce,
        hash: transactionReceipt.transactionHash,
        orderId: transactionReceipt.transactionHash,
    }


}

async function sendAndWait(uniswapV2Router02, swapParameters, gasPriceGwei, gasLimit, beginTime, transId, maxWaitSeconds, nonce) {

    //开始调用智能合约  (也可先调用uniswapV2Router02.populateTransaction查看将要发送出去的参数)
    let transactionResponse = await uniswapV2Router02[swapParameters.methodName](...swapParameters.args, {
        gasPrice: ethers.utils.parseUnits(gasPriceGwei, "gwei"),
        gasLimit: gasLimit,
        value: swapParameters.value,
        nonce: nonce
    })
    console.info(`${logHead(transId)}发送交易耗时：${Date.now() - beginTime},nonce:${transactionResponse.nonce}`)

    //等待打包
    let packSucceed = true//打包成功？
    let transactionReceipt = await config.provider.waitForTransaction(
        transactionResponse.hash,
        1,
        maxWaitSeconds * 1000
    ).catch(err => {
        console.info(logHead(transId) + JSON.stringify(err) + "。提高手续费，重新发送交易，覆盖之前的交易")
        packSucceed = false
    })
    if (packSucceed) {
        console.info(`${logHead(transId)}waitForTransaction耗时：${Date.now() - beginTime},confirmations:${transactionReceipt.confirmations},gasUsed:${transactionReceipt.gasUsed}${transactionReceipt.gasUsed > 50000 ? ' ok' : ' 交易回滚'}`)
    }

    return [packSucceed, transactionResponse, transactionReceipt]
}

exports.addOrder = addOrder
