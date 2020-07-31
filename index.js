const accountService= require("./account_service")
const productService= require("./productService")
const hprose = require("hprose")
const config = require('./config')
const JSBI= require('jsbi')
//启动服务：node --harmony index.js
startRpcServer()


function startRpcServer(){
    /*
    滑点：从你的交易指令发出，到你的交易被执行，如果这期间价格有变动，不是你当初获取到的价格了，那么你的交易是否应该继续被执行呢？
        你愿意容忍多少比例的变动？
    Price Impact：你的交易，导致价格上涨了多少？你的交易会按照上涨后的价格执行。
    为了搬平0.3%的差价，需要多少eth资金？usdc:55,dai:50,usdc-usdt:31,usdt:21,lend:15,link:12,wbtc:13, knc:5,zrx:0.9,

     */

    ////////////////////////
    const server = hprose.Server.create(config.serverUri);
    server.addFunction(accountService.queryTokenBalance,);
    server.addFunction(productService.bookProduct)

    server.start();
}

//console.log(JSBI.BigInt('0x11').toString())
