# js_rpc_server

#### 介绍
把js语言实现的项目，做成远程调用服务。目前只有uniswap-sdk和ethersproject

#### 软件架构
软件架构说明


#### 安装教程

1.  上线时，要修改config.js,把process.argv.splice(3)改成
process.argv.splice(2)，把chainId改成主网
2.  本程序会自动创建数据库表。但是要确保相关路径/文件夹存在
3.  xxxx

#### 使用说明

1.  xxxx
2.  xxxx
3.  xxxx

#### 参与贡献

1.  Fork 本仓库
2.  新建 Feat_xxx 分支
3.  提交代码
4.  新建 Pull Request


#### 码云特技

1.  使用 Readme\_XXX.md 来支持不同的语言，例如 Readme\_en.md, Readme\_zh.md
2.  码云官方博客 [blog.gitee.com](https://blog.gitee.com)
3.  你可以 [https://gitee.com/explore](https://gitee.com/explore) 这个地址来了解码云上的优秀开源项目
4.  [GVP](https://gitee.com/gvp) 全称是码云最有价值开源项目，是码云综合评定出的优秀开源项目
5.  码云官方提供的使用手册 [https://gitee.com/help](https://gitee.com/help)
6.  码云封面人物是一档用来展示码云会员风采的栏目 [https://gitee.com/gitee-stars/](https://gitee.com/gitee-stars/)

在thegraph上面查询：uniswap子图：(address地址要小写，不能包含大写字母)
user -> liquidityPosition -> liquidityPositionSnapshot
三者从大到小层层包含。描述了某做市商在某交易对拥有的资金，以及他在历史上曾今用用的资金
https://thegraph.com/explorer/subgraph/uniswap/uniswap-v2?selected=playground

{
  liquidityPositionSnapshots(first:5,
    where:{user:"0xb61d572d3f626c0e4cdffae8559ad838d839f229",
      block:10704159,
      pair:"0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852"}){
    id
    timestamp
    user{id}
    liquidityTokenBalance
    reserve0
    reserve1
    reserveUSD
    timestamp
  }
  user(id:"0xb61d572d3f626c0e4cdffae8559ad838d839f229"){
    liquidityPositions{
      id
      poolOwnership
      user{id}
      pair{id}
      liquidityTokenBalance
      historicalSnapshots{
        pair{id}
        
      }
    }
    id
  }
  
}