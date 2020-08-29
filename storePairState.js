/**
 手动调用。存储某个时间范围内的资金池状态，每小时只存一条数据。调用时，可传递某个pair的地址。如果不传就表示处理全部pair
 */
const sqlite3 = require('sqlite3').verbose()
const open = require('sqlite').open
const ApolloClient = require('apollo-client').ApolloClient
const InMemoryCache = require('apollo-cache-inmemory').InMemoryCache
const HttpLink = require('apollo-link-http').HttpLink
const gql = require('graphql-tag')
const fetch = require('cross-fetch/polyfill').fetch
const dateUtil = require('./dateUtil')
const config = require('./config')
const pairArr = require('./properties.json').pairObjArr
const util = require('./util')
const uniswapSDK = require('@uniswap/sdk')

const format = 'yyyy-MM-dd hh:mm:ss'

const client = new ApolloClient({
    link: new HttpLink({
        //uri: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2",
        uri: "https://api.thegraph.com/subgraphs/name/ianlapham/uniswapv2",
    }),
    fetch: fetch,
    fetchOptions: {
        mode: 'no-cors'
    },
    cache: new InMemoryCache(),
    defaultOptions: {//不使用缓存
        /* 参考：https://www.apollographql.com/docs/react/v2.5/api/apollo-client/
          fetchPolicy "cache-first" | "network-only" | "cache-only" | "no-cache" | "standby" | "cache-and-network"
         */
        watchQuery: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'ignore',
        },
        query: {
            fetchPolicy: 'no-cache',
            errorPolicy: 'all',
        },
    }
})

const QUERY_SWAPS = gql`
query querySwaps($pairAddress: Bytes!,$beginTime: BigInt, $endTime: BigInt) {
swaps(where:{
    pair:$pairAddress
    timestamp_gte:$beginTime
    timestamp_lt:$endTime
  },orderBy:timestamp, orderDirection:asc, first:1){
    id
    timestamp
    pair{id}
    amount0In
    amount1In
    amount0Out
    amount1Out
  }
}
`

async function query(query, pairAddress, beginTime, endTime) {
    let result = await client.query({
        query: query,
        variables: {
            pairAddress: pairAddress,
            beginTime: beginTime,
            endTime: endTime,
        }
    }).catch(err => console.error(err));

    //return result.data.swaps
    return result.data.liquidityPositionSnapshots
}
/*
//每查询一次，提取一小时范围的数据。如果不传参数，就会处理所有交易对
async function runHour(pairAddress) {
    const QUERY_snapshot_hour = gql`
query querySnapshot($pairAddress: Bytes!,$beginTime: Int, $endTime: Int) {
liquidityPositionSnapshots(where:{
    pair:$pairAddress
    timestamp_gte:$beginTime
    timestamp_lt:$endTime
  },orderBy:timestamp, orderDirection:asc, first:1){
    timestamp
    reserve0
    reserve1
    liquidityTokenTotalSupply
  }
}
`

    for (let pair of pairArr) {
        if (pairAddress && pair.address !== pairAddress.toLowerCase()) {
            continue
        }
        console.log(new Date().toLocaleString() + "runHour开始处理pair:" + pair.address)
        //let pairAddress = '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852'
        let symbolArr = pair.name.split('-')
        let tokenObjArr = [config.tokens[symbolArr[0]], config.tokens[symbolArr[1]]]
        let tokenA = new uniswapSDK.Token(config.chainId, tokenObjArr[0].address, tokenObjArr[0].decimals, tokenObjArr[0].symbol)
        let tokenB = new uniswapSDK.Token(config.chainId, tokenObjArr[1].address, tokenObjArr[1].decimals, tokenObjArr[1].symbol)
        let tokenArr = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]

        const db = await open({filename: config.dbPath, driver: sqlite3.Database})//如果要cache那就sqlite3.cached.Database
        let beginTime = dateUtil.parseDate('2020-01-01 00:00:00', format, 'utc').getTime()
        let endTime = dateUtil.parseDate('2020-08-23 07:00:00', format, 'utc').getTime()

        //let beginTime = dateUtil.parseDate('2020-08-24 00:00:00', format, 'utc').getTime()
        //let endTime = dateUtil.parseDate('2020-08-24 10:00:00', format, 'utc').getTime()
        let thisHour, nextHour
        for (thisHour = new Date(beginTime); thisHour.getTime() < endTime; thisHour = nextHour) {
            nextHour = new Date(thisHour.getTime())//必须拷贝一份，而不能指向同一块内存
            nextHour.setUTCHours(thisHour.getUTCHours() + 1)
            //开始查询
            try {
                let objArr = await query(
                    QUERY_snapshot_hour,
                    pair.address,
                    thisHour.getTime() / 1000,
                    nextHour.getTime() / 1000
                ).catch(err => console.error(err));

                if (objArr && objArr.length > 0) {
                    let obj = objArr[0]
                    console.log(dateUtil.formatDate(thisHour, format, 'utc') + " ok: " +
                        dateUtil.formatDate(new Date(obj.timestamp * 1000), format, 'utc'))

                    let row = [
                        pair.address,
                        pair.name,
                        dateUtil.formatDate(thisHour, format, 'utc'),
                        util.movePointRight(obj.liquidityTokenTotalSupply, 18),
                        util.movePointRight(obj.reserve0, tokenArr[0].decimals),
                        util.movePointRight(obj.reserve1, tokenArr[1].decimals),
                    ]
                    let stmt
                    try {
                        stmt = await db.prepare("INSERT INTO pair_state(pair_address,pair_name,date_time,totalsupply,reserve0,reserve1) VALUES (?,?,?,?,?,?)");

                        await stmt.bind(row)
                        await stmt.run()

                    } catch (e) {
                        console.log(e)
                    } finally {
                        await stmt.finalize()
                    }
                } else {
                    console.log(dateUtil.formatDate(thisHour, format, 'utc') + "objArr.length:为空")
                }
            } catch (e) {
                console.log(e)
            }

            //睡眠一段时间，防止太频繁
            await new Promise(resolve => setTimeout(resolve, 1000))
        }//end for hour

        await db.close()
    }//end for  pair

}
*/

//每查询一次，提取一天的数据。并且从中提取每小时的数据(每小时只选择一条)
//如果不传参数，就会处理所有交易对
async function runDay(pairAddress) {
    const QUERY_snapshot_day = gql`
query querySnapshot($pairAddress: Bytes!,$beginTime: Int, $endTime: Int) {
liquidityPositionSnapshots(where:{
    pair:$pairAddress
    timestamp_gte:$beginTime
    timestamp_lt:$endTime
  },orderBy:timestamp, orderDirection:asc,first:1000){
    timestamp
    reserve0
    reserve1
    liquidityTokenTotalSupply
  }
}
`

    for (let pair of pairArr) {
        if (pairAddress && pair.address !== pairAddress.toLowerCase()) {
            continue
        }
        console.log(new Date().toLocaleString() + "runDay开始处理pair:" + pair.address)
        //let pairAddress = '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852'
        let symbolArr = pair.name.split('-')
        let tokenObjArr = [config.tokens[symbolArr[0]], config.tokens[symbolArr[1]]]
        let tokenA = new uniswapSDK.Token(config.chainId, tokenObjArr[0].address, tokenObjArr[0].decimals, tokenObjArr[0].symbol)
        let tokenB = new uniswapSDK.Token(config.chainId, tokenObjArr[1].address, tokenObjArr[1].decimals, tokenObjArr[1].symbol)
        let tokenArr = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]

        const db = await open({filename: config.dbPath, driver: sqlite3.Database})//如果要cache那就sqlite3.cached.Database
        let beginTime = dateUtil.parseDate('2020-01-01 00:00:00', format, 'utc').getTime()
        let endTime = dateUtil.parseDate('2020-08-23 07:00:00', format, 'utc').getTime()

        //let beginTime = dateUtil.parseDate('2020-08-20 00:00:00', format, 'utc').getTime()
        //let endTime = dateUtil.parseDate('2020-08-23 00:00:00', format, 'utc').getTime()
        let thisDay, nextDay
        for (thisDay = new Date(beginTime); thisDay.getTime() < endTime; thisDay = nextDay) {
            nextDay = new Date(thisDay.getTime())//必须拷贝一份，而不能指向同一块内存
            nextDay.setUTCDate(thisDay.getUTCDate() + 1)
            //开始查询
            try {
                let objArr = await query(
                    QUERY_snapshot_day,
                    pair.address,
                    thisDay.getTime() / 1000,
                    nextDay.getTime() / 1000
                ).catch(err => console.error(err));

                if (objArr && objArr.length > 0) {

                    await storeEveryHour(objArr, thisDay, nextDay, db, pair, tokenArr)

                } else {
                    console.log(dateUtil.formatDate(thisDay, format, 'utc') + "objArr.length:为空")
                }
            } catch (e) {
                console.log(e)
            }

            //睡眠一段时间，防止太频繁
            await new Promise(resolve => setTimeout(resolve, 1000))
        }//end for hour

        await db.close()
    }//end for  pair

}

//辅助方法，对一天的数据，进行整理：每小时只挑选一条数据
async function storeEveryHour(objArr, thisDay, nextDay, db, pair, tokenArr) {
    console.log("开始处理日期：" + dateUtil.formatDate(thisDay, format, 'utc'))
    let thisHour, nextHour
    let stmt = await db.prepare("INSERT INTO pair_state(pair_address,pair_name,date_time,totalsupply,reserve0,reserve1) VALUES (?,?,?,?,?,?)");

    for (thisHour = thisDay; thisHour.getTime() < nextDay.getTime(); thisHour = nextHour) {
        nextHour = new Date(thisHour.getTime())//必须拷贝一份，而不能指向同一块内存
        nextHour.setUTCHours(thisHour.getUTCHours() + 1)

        for (let obj of objArr) {
            //如果在这个时间范围，就处理，并且跳出循环。因为每个范围只需要一条数据
            if (thisHour.getTime() <= obj.timestamp * 1000 && obj.timestamp * 1000 < nextHour.getTime()) {
                console.log(dateUtil.formatDate(thisHour, format, 'utc') + " ok: " +
                    dateUtil.formatDate(new Date(obj.timestamp * 1000), format, 'utc'))

                let row = [
                    pair.address,
                    pair.name,
                    dateUtil.formatDate(thisHour, format, 'utc'),
                    util.movePointRight(obj.liquidityTokenTotalSupply, 18),
                    util.movePointRight(obj.reserve0, tokenArr[0].decimals),
                    util.movePointRight(obj.reserve1, tokenArr[1].decimals),
                ]

                try {
                    await stmt.bind(row)
                    await stmt.run()

                } catch (e) {
                    console.log(e)
                }

                break
            }//end if
        }//end for

    }//end for
    await stmt.finalize()
}


//开始调用
let index = 2
let pairAddress
if (process.argv.length > index) {
    const args = process.argv.splice(index);
    console.log(args[0]+"..."+JSON.stringify(args))
    if(args[0].indexOf('>')<0&&args[0].indexOf('&')<0) {
        pairAddress = args[0]
    }
}
runDay(pairAddress).catch(error => console.error(error));