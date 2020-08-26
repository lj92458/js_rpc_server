const sqlite3 = require('sqlite3').verbose()
const open = require('sqlite').open
const schedule = require('node-schedule')
const pairArr = require('./properties.json').pairObjArr
const ethers = require('ethers')
const IUniswapV2Pair = require('@uniswap/v2-core/build/IUniswapV2Pair.json')
const config = require('./config')

/**
 * 定时存储uniswap各交易对的资金池状态(totalsupply,reserve0,reserve1).并提供查询功能。用来生成收益走势图。
 */


//定时任务表达式格式：s(0-59) m(0-59) h(0-23) d(1-31) m(1-12) date(0-7)
const job = schedule.scheduleJob('0 0 * * * *', storePairState);


/**
 * 存储各交易对状态：totalsupply,reserve0,reserve1
 *
 */
async function storePairState() {
    console.log(new Date().toLocaleString() + "开始执行定时任务")
     async function readContract(contract,pair){
        //console.log("查询交易对" + pair.name + ":" + pair.address)
        const [reserves0, reserves1] = await contract.getReserves()
        const totalsupply = await contract.totalSupply()

        rowArr.push([
            pair.address,
            pair.name,
            totalsupply.toString(),
            reserves0.toString(),
            reserves1.toString()
        ])
    }

    let rowArr = []
    for (let pair of pairArr) {
        const contract = new ethers.Contract(pair.address, IUniswapV2Pair.abi, config.provider)
        try {
            await readContract(contract,pair)
        } catch (e) {
            if (e.message.indexOf('failed to meet quorum')>=0) {
                    await readContract(contract).catch(e=>{
                        console.info("再次失败！")
                    })
            } else {
                console.info("查询pair异常:" + e.message)
            }
        }
    }
    console.log(new Date().toLocaleString() + "查询完毕，开始插入")

    //将数据批量存入数据库 文档：  https://github.com/kriasoft/node-sqlite star:578 ,fork 73  支持es6的promise
    const db = await open({filename: config.dbPath, driver: sqlite3.Database})//如果要cache那就sqlite3.cached.Database
    await db.exec(`
create table if not exists pair_state (
    pair_address char(42),
    pair_name varchar (20),
    date_time datetime DEFAULT CURRENT_TIMESTAMP,--这是utc时间。 或者插入 datetime('now', 'localtime')
    totalsupply varchar(50),--token总量
    reserve0 varchar(50),--资产数量
    reserve1 varchar(50),--资产数量
    PRIMARY KEY (pair_address,date_time)
) `);

    let stmt = await db.prepare("INSERT INTO pair_state(pair_address,pair_name,totalsupply,reserve0,reserve1) VALUES (?,?,?,?,?)");
    for (let row of rowArr) {

        await stmt.bind(row)
        await stmt.run()
    }
    await stmt.finalize()


    await db.close()
    console.log(new Date().toLocaleString() + "定时任务完成")
}

//storePairState().catch(e => console.log(e))


//查询某交易对的历史状态
async function queryPairState(pairAddress, beginDateTime) {
    const db = await open({filename: config.dbPath, driver: sqlite3.Database})

    let rows = await db.all(`SELECT date_time,totalsupply,reserve0,reserve1 FROM pair_state 
                        where pair_address=? and date_time>=? order by date_time limit 1000`,
        pairAddress,
        beginDateTime)

    await db.close()
    //console.log(rows)
    return rows
}

/*queryPairState("0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852", "2020-08-23 02:15:40").then(
    rows=>console.log(rows.length)
    ,e => console.log(e))
*/

exports.queryPairState = queryPairState