let config
let accountService
let productService
let orderService
let hprose
let LpProfit

//因为hprose要用require，所以干脆整个文件都用require,而不能用import
async function init() {
    try {
        config = await import('./config.js');
        accountService = await import("./accountService.js");
        productService = await import("./productService.js");
        orderService = await import("./orderService.js");
        hprose = require("hprose");
        LpProfit = require("./LpProfit.cjs");
    } catch (e) {
        console.error(new Date().toLocaleString() + ' init异常：', e.stack || e)
    }
}

function logProcessEvent() {
    //参数code表示退出码
    process.on("exit", function (code) {
        console.log(Date.now() + " exit: " + code)
    });
    //参数err表示发生的异常
    process.on("uncaughtException", function (e) {
        console.log(Date.now() + ' exception: ', e.stack || e);
    });
    process.on('unhandledRejection', (e, promise) => {
        console.log('Unhandled Rejection at:', e.stack || e)
    })

    process.on('SIGTERM', signal => {
        console.log(`Process ${process.pid} received a SIGTERM signal`)
        //process.exit(0)
    })

    process.on('SIGINT', signal => {
        console.log(`Process ${process.pid} has been interrupted`)
        //process.exit(0)
    })
    process.on('beforeExit', code => {
        // Can make asynchronous calls
        setTimeout(() => {
            console.log(`Process will exit with code: ${code}`)
            //process.exit(code)
        }, 100)
    })

}

function startRpcServer() {
    /*
    滑点：从你的交易指令发出，到你的交易被执行，如果这期间价格有变动，不是你当初获取到的价格了，那么你的交易是否应该继续被执行呢？
        你愿意容忍多少比例的变动？
    Price Impact：你的交易，导致价格上涨了多少？你的交易会按照上涨后的价格执行。
    为了搬平0.3%的差价，需要多少eth资金？usdc:55,dai:50,usdc-usdt:31,usdt:21,lend:15,link:12,wbtc:13, knc:5,zrx:0.9,

     */

    ////////////////////////
    try {
        const server = hprose.Server.create(config.serverUri)
        server.addFunction(accountService.queryTokenBalance,)
        server.addFunction(productService.bookProduct)
        server.addFunction(productService.getGasPriceGweiAndEthPrice)
        server.addFunction(orderService.addOrder)
        //server.addFunction(LpProfit.queryPairState)
        server.addFunction(config.getProp)
        server.addFunction(config.getConfig)
        server.start()
    } catch (e) {
        console.error(new Date().toLocaleString() + ' startRpcServer异常：', e.stack || e)

    }
}

//启动服务：pm2 start index.cjs mima chainId [LOCAL | MAINNET | WALLET_EXTENSION]
/**
 * SupportedChainId.MAINNET = 1,
 * SupportedChainId.GOERLI = 5,
 * SupportedChainId.CELO = 42220,
 * SupportedChainId.CELO_ALFAJORES = 44787,
 */
init().then(value => startRpcServer())
logProcessEvent()





