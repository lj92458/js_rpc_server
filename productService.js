const uniswapSDK = require('@uniswap/sdk')
const IUniswapV2Pair = require('@uniswap/v2-core/build/IUniswapV2Pair.json')
const ethers = require('ethers')
const config = require('./config')
const util = require("./util")


/**
 * 查询某个交易对的市场挂单。
 * @param coinPair 例如：dai-eth (前面是goods,后面是money)
 * @param marketOrderSize 返回的订单数量
 * @param orderStepLength 两个相邻的挂单之间价格差距多少？对少于这个差距的挂单合并。建议为价格的万分之一/万分之二
 * @return 返回一个复杂对象： {ask:[[price,volume]],bid:[[price,volume]]}
 */
async function bookProduct(coinPair, marketOrderSize, orderStepLength) {

    const [goods, money] = coinPair.toLowerCase().split("-")
    let goodsToken, moneyToken
    const [goodsObj, moneyObj] = [config.tokens[goods], config.tokens[money]]
    if (!goodsObj || !moneyObj) {
        throw Error("token 不存在：" + [goods, money])
    }

    goodsToken = new uniswapSDK.Token(config.chainId, goodsObj.address, goodsObj.decimals, goodsObj.symbol)
    moneyToken = new uniswapSDK.Token(config.chainId, moneyObj.address, moneyObj.decimals, moneyObj.symbol)

    const pair = await uniswapSDK.Fetcher.fetchPairData(goodsToken, moneyToken, config.provider)
    const [str, num] = util.movePointRight2(orderStepLength)
    const orderStep_F = new uniswapSDK.Fraction(str, util.movePointRight("1",num))
    //用卖的办法，模拟出市场买单。然后我可以卖给它。
    let bids = createMarketOrder(pair, goodsToken, moneyToken, marketOrderSize, orderStep_F, goodsToken)
    //console.log(bids)
    //console.log("=======================")
    //用买的办法，模拟出市场卖单。然后我可以买它。
    //新的step等于oldStep/(oldPrice*oldPrice)
    let goodsPrice = pair.priceOf(goodsToken).adjusted
    let newStep_F = orderStep_F.divide(goodsPrice.multiply(goodsPrice))
    //console.log("newStep_F:"+newStep_F.toFixed(15))
    let asks = createMarketOrder(pair, moneyToken, goodsToken, marketOrderSize, newStep_F, goodsToken)
    //console.log(asks)
    return {asks: asks, bids: bids}
}

//辅助方法。生成市场挂单。
function createMarketOrder(pair, inputToken, outputToken, marketOrderSize, orderStep_F, goodsToken) {
    //模拟生成市场挂单
    /*
    设池中有xy两种币。用a量的x能换来b量的y。请问b是多少？答：b=997ay/(1000x+997a)
    用x换y，会导致x价格下降。请问用多少x换y，才能导致执行价下降比例是r？也就是给定r，求a. (初始价:y/x,执行价:b/a)
    【计算出来的a，只是能保证当前价跟执行价之间的关系是r，不能保证这个执行价，跟下一个执行价之间的关系还是r】
    答案：a=x( 1/(1-[r + 3/1000]) - 1000/997 )/2
     */
    //计算a (a是个小数。)

    const r = orderStep_F.divide(pair.priceOf(inputToken).adjusted)
    //console.log(r.toSignificant(30))
    const a = pair.reserveOf(inputToken).multiply(
        (new uniswapSDK.Fraction("1")).divide(
            //因为a必须>0 ,所以r必须大于0.003 。所以给r加上0.003
            (new uniswapSDK.Fraction("1")).subtract(r.add(new uniswapSDK.Fraction("3", "1000")))
        ).subtract(new uniswapSDK.Fraction("1000", "997"))
    ).divide("2")

    //console.log(a.toFixed(6))
    const inputAmount = new uniswapSDK.TokenAmount(inputToken, util.movePointRight(a.toFixed(6), inputToken.decimals))
    let outputAmountArr = []
    for (let i = 0, tmpPair = pair; i < marketOrderSize; i++) {
        [outputAmountArr[i], tmpPair] = tmpPair.getOutputAmount(inputAmount)

    }
    let orderArr = []
    let isSell = goodsToken.equals(inputToken)//如果是用商品换钱（卖单）
    let moneyToken = isSell ? outputToken : inputToken
    for (let outputAmount of outputAmountArr) {
        let [goodsAmount, moneyAmount] = isSell ? [inputAmount, outputAmount] : [outputAmount, inputAmount]
        let price = new uniswapSDK.Price(goodsToken, moneyToken, goodsAmount.raw, moneyAmount.raw).toFixed(6)
        let amount = goodsAmount.toFixed(6)
        orderArr.push([price, amount])
    }
    return orderArr
}

/**
 * 查询gas费，以及eth相对某种币的价格
 * @param moneySymbol 交易对中的计价货币
 * @return {Promise<Array>}
 */
async function getGasPriceGweiAndEthPrice(moneySymbol) {
    let gasPrice
    if (moneySymbol === 'eth') {
        gasPrice = await config.provider.getGasPrice()
        let gasPriceGwei = ethers.utils.formatUnits(gasPrice, "gwei")
        return [Number(gasPriceGwei).toFixed(2), 1]

    } else {
        const [goods, money] = ['weth', moneySymbol]
        let goodsToken, moneyToken
        const [goodsObj, moneyObj] = [config.tokens[goods], config.tokens[money]]
        if (!goodsObj || !moneyObj) {
            throw Error("token 不存在：" + [goods, money])
        }

        goodsToken = new uniswapSDK.Token(config.chainId, goodsObj.address, goodsObj.decimals, goodsObj.symbol)
        moneyToken = new uniswapSDK.Token(config.chainId, moneyObj.address, moneyObj.decimals, moneyObj.symbol)
        const [pair, gasPrice] = await Promise.all([
            uniswapSDK.Fetcher.fetchPairData(goodsToken, moneyToken, config.provider),
            config.provider.getGasPrice()
        ])
        const [goodsAmount, moneyAmount] = pair.token1.equals(goodsToken) ? [pair.reserve1, pair.reserve0] : [pair.reserve0, pair.reserve1]
        let price = new uniswapSDK.Price(goodsToken, moneyToken, goodsAmount.raw, moneyAmount.raw).toFixed(6)
        let gasPriceGwei = ethers.utils.formatUnits(gasPrice, "gwei")
        return [Number(gasPriceGwei).toFixed(2), price]

    }
}

//test
/*
bookProduct("eth-usdc", 100, 0.03203).catch(e => {
    console.log(e + "" + e.message)
})
 */
//getGasPriceGweiAndEthPrice("dai").then(arr=>{console.info(arr[0],arr[1])})

exports.bookProduct = bookProduct
exports.getGasPriceGweiAndEthPrice = getGasPriceGweiAndEthPrice
