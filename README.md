# js_rpc_server

#### 介绍
把别人用js语言实现的功能，包装成远程调用服务。目前只有uniswap-sdk和ethersproject
注意：涉及到 x * y=k, x * sqrt(PriceX) =L, pool.liquidity, pool.sqrtRatioX96这些内容的，数据单位一律是聪、伟这些最小单位。 
#### 软件架构
软件架构说明


#### 安装教程

1.  上线时，要修改config.js,把process.argv.slice(3)改成
process.argv.slice(2)，把chainId改成主网
2.  本程序会自动创建数据库表。但是要确保相关路径/文件夹存在
3.  xxxx

#### 使用说明

1.  启动服务：node --harmony index.js mima chainId
      以太主网=1，celo=42220
2.  xxxx
3.  xxxx

#### 参与贡献

1.  Fork 本仓库
2.  新建 Feat_xxx 分支
3.  提交代码
4.  新建 Pull Request


#### 相关知识

0. uniswap各个sdk包的作用：
* @uniswap/v3-sdk 用于在uniswap-v3上构建程序的sdk,用ts实现. 参考 https://docs.uniswap.org/sdk/v3/overview
* @uniswap/v3-periphery 对uniswap内核高度封装而形成的合约. 参考 https://docs.uniswap.org/contracts/v3/reference/periphery/base/BlockTimestamp
* @uniswap/v3-core   uniswap合约内核. 参考 https://docs.uniswap.org/contracts/v3/overview
* @uniswap/sdk-core 对其它sdk数据结构的抽象，用于多个sdk之间共享数据结构、互相传递数据。各sdk都会依赖这个包。
                      参考 https://docs.uniswap.org/sdk/core/reference/overview
1. 各种合约、代币的地址 https://docs.uniswap.org/contracts/v3/reference/deployments
2. uniswap v3创建了新的常量：Ether, 代表以太币。追溯它的继承关系：Ether->NativeCurrency->BaseCurrency. 调用它的wrapped属性，可以得到weth
   这使得eth具有和weth同等的地位，凡是能传入weth的地方，都能传入Ether(为了统一，应该调用一下wrapped属性). 创建对象：Ether.onChain(ChainId), 支持各种以太系的区块链【WMATIC代表MATIC. 但是不支持celo.】

3. tick是最小报价单位(可以是负数，表示价格在0~1之间)。TICK_SPACING翻译成“报价间距”，代表两个相邻报价之间间隔了多少个tick(或者说把这些tick分成小组，每组多少个tick; pool.tickBitmap和pool.ticks只存储每组第一个tick的状态)。
   报价间距的大小，仅仅影响流动性提供者的体验(价格范围精确到多少)、交易者的gas消耗量、手续费费率。TICK_SPACINGS的定义是{[amount in FeeAmount]: number;}，具体映射如下：
   FeeAmount.LOWEST=100，对应着间距1, //手续费0.01%，最小能允许你设置0.01%的做市范围(btc价格2万, 0.01%就是2)
   FeeAmount.LOW=500，对应着间距10, //手续费0.05%，最小能允许你设置0.1%的做市范围(btc价格2万, 0.1%就是20)
   FeeAmount.MEDIUM=3000，对应着间距60, //手续费0.3%，最小能允许你设置0.6%的做市范围(btc价格2, 0.6%就是120)
   FeeAmount.HIGH=10000，对应着间距200 //手续费1%，最小能允许你设置2%的做市范围(btc价格2万, 2%就是400)
4. 问题：当一名做市场，除了能赚到手续费，能否赚到高抛低吸的差价？
   答案是：不能。【例1】为了简化问题，我们假设某用户资金量是10，他设定了positon的价格区间是1到10，市场价刚好在1到10之间反复波动，他的资金平分成10份。当价格降到10，他花一元钱购买0.1个，当降到9，他又花一元钱购买1.111个，降到8，他再花一元钱
   购买0.125个......降到2他再花一元钱购买0.5个，降到1他再花1元购买1个。到此为止，他的10元钱均匀的撒在每个价位，只是每次交易得到的币越来越多。接下来价格开始上涨，涨到1，他卖出1个得到1元，涨到2，他卖出0.5个得到1元，涨到3他再卖出0.333个得到1元......一直涨到10，他卖出0.1个得到1元。
   到此为止，他在每个价位得到了一元钱，只是每得到一元钱，需要付出的币越来越少。10次买入，和10次卖出是互相抵消的，这一圈走下来，他没赚也没亏：币耗尽了，10元钱又回到了手中。
   这跟量化交易中的网格算法有什么区别呢，为什么网格算法这样来回收割，就能赚到钱？区别就是：买入时，要用全部资金买入(在最低价抄底)，而不是把资金平分成几份、越跌越买。卖出时也要卖出全部的币(在最高点逃顶)，而不是分批次卖出、越涨越卖。
   【例2】更简化的例子：假设你有2元钱，价格在1到2之间波动，当价格是1时，你就用2元钱买入2个币(而不是只用一半的钱), 当价格是2时，你就卖出2个币得到4元(于是你就赚了2元)，或者你只卖出1个币也行(那就是回本且赚了一个币)。
   【例3】网格算法更具体的情形：当前市场价1.5，眼看着价格从1.5往下降，越来越低，这时要忍住，不要急于抄底，而是要坚信价格会降到1. 等真的降到1了你就买入了。然后价格涨到1.1了，你要忍住别卖，坚信价格会涨到2. 
   等涨到1.5了还是不卖，等真的涨到2了你就卖。这样就赚到差价了。而不是在价格1.1卖一部分，1.2卖一部分，1.3卖一部分... 因此网格的买单和卖单总是成双成对，你在价格下跌了0.5时买入，也应该等价格涨了0.5再卖(也就是从1.5涨到2)
   【例4】进一步拓展，能得到网格算法的全部思想：当前价格是9.5，你在9、8、7、6处分别挂买单，这些买单分别跟你在10、9、8、7处的卖单组成一对，每对订单差价1元。当9元的买单成交，就会把10元的卖单挂出去；当8元的买单成交，就会把9元的卖单挂出去。
    现在回到【例1】，在价格从10降到1的过程中，分批次买入了(这叫下网), 那么就应该在价格从2涨到11的过程中，分批次卖出(网子向上提了1元)。为什么网子不一下子向上提10元？提的越多，差价就越大，获利也越大，但是获利的频率就越低，
    而且你是在做预测。你怎么知道价格会在某个大范围来回震荡，而不是在小范围蠕动？
    
 
5. 已知tick编号是i,怎么知道它代表的价格(一聪btc等价于多少伟eth)？ price(i) = 1.0001的i次方，也就是说相邻tick之间的价格差距是0.01%. tick是用int24表达的，所以最多有2的24次方个tick,也就是1677万个(正负838万)，能表达无穷大的数据。
   实际上程序硬性规定了tick范围是正负88万： -887272 ~ 887272
6. QuoterV2合约，是为了预计算。不是在链上执行的，因此不会消耗gas. 调用方式为provider.call(而不是wallet.sendTransaction),用call函数调用任何合约，一律不消耗gas
7. QuoterV2跟Pool.getOutputAmount区别是什么？ 
   答：uniswap v3的精髓就在于众多的tick，每次创建positon、修改position，都会修改两个tick。要想得到准确的输入输出，必须访问真实的tick数据。 给定输入，以上两种方法都能计算输出，二者都会访问实时的链上tick数据。
   前者代码全部在Provider上执行(免费)，后者在需要访问tick数据时，才会去查询tickDataProvider(前提是构造pool时传入了tickDataProvider。而tickDataProvider的构造，
   依赖于TickLens.getPopulatedTicksInWord(poolAddress, tickBitmapIndex)，它能一次查出一字节的tick来(倒序排列)，也就是256个。字节编号最多有65535个).TickListDataProvider.getTick()会用二分查找法找到小端最接近的tick.
   UniswapV3Pool.sol里面定义了变量：ticks、tickBitmap、positions，用来保存所有的position、有效的tick。
   mint函数负责创建position, burn函数负责销毁position，二者都会调用_modifyPosition和_updatePosition，进而调用ticks.update来更新该position起止位置的两个tick的属性：liquidityNet和liquidityGross.
   每当有流动性将该tick设为价格上限或下限，tick.liquidityGross都会增加，因此它表示全部流动性(包括了激活的和没激活的)。
   pool维护了【全局变量liquidity】，表示整个池子目前被激活了的流动性。swap函数为了耗尽inAmount,会用while循环依次访问每个有效tick(从当前这个有效或无效tick穿越到下一个有效tick), 
   给liquidity加上tick.liquidityNet(有正有负,导致liquidity变大或变小), 并且利用liquidity计算出该tick对应的inAmount、outAmount。
   
   在注入或移除数量为 l 的流动性时，具体规则如下： (参考https://learnblockchain.cn/article/3055)
      a.注入流动性，tick 是价格下限，liquidityNet 增加 l
      b.注入流动性，tick 是价格上限，liquidityNet 减少 l
      c.移除流动性，tick 是价格下限，liquidityNet 减少 l
      d.移除流动性，tick 是价格上限，liquidityNet 增加 l

8. 虽然QuoterV2调用了revert()函数能取消调用，并且退还 Gas 费，那也只是退还剩余部分，已被计算花销了的Gas并不会退还，那客户端不是还是要为了抓取一个汇率而付费吗？
   其实，在客户端（如 ethers）中，会使用 contract.staticCall(…) 的方式，让节点以“假装”不会有状态变化的方式来尝试调用一个 public 函数，来达到没有 Gas 花费而又抓取了汇率的效果。假设baseContractMethod就是你想调用的方法.
   因此，预计算可以白嫖算力。参考https://davidc.ai  QuoterV2不是view类型也不是pure类型。之所以能免费，就是因为contract.staticCall实现了预计算(原理是通过调用provider.call)。
9. 【sqrtRatioX96】也叫sqrtPriceX96，计算公式是 sqrt(token1Amount/token0Amount).这里token1Amount的单位是聪或伟。也就是：token0价格的平方根，用Q64.96格式表达。构建一个pool对象时，需要传入这个值。很明显把token0当成了goods，token1当成了money.
   【sqrtPriceLimitX96】是能够承受的价格上限（或下限），格式为Q64.96 调用swap函数时需要传入.
   【Q64.96】是一种Q number format(Q notation、Q格式、Q表示法、定点数格式)。它区别于浮点数表示法。
           无符号定点数：Q15表示小数部份有15个位，而Q1.14表示1个整数位以及14个小数字(把这个二进制的整数，小数点左移14位，或者除以2的14次方，就能得到真实的值)。
           有符号的定点数：有二种Q格式，其中一种是将符号位算在整数位里，但另外一种就不是。 例如，16位的有号整数（无小数字）可以表示为Q16.0或Q15.0。更多知识请搜索【浮点数 定点数】
           或者这个科普： https://uniswap.org/blog/uniswap-v3-math-primer
10. 你可以从两个地方得到价格(后者精度略差)。价格是指：一聪btc等价于多少伟eth。
        price = (pool.sqrtPriceX96/(2** 96))** 2
        price = 1.0001** pool.tickCurrent
   因为【tickCurrent规定为整数】这一特性会导致计算价格略小.(tickCurrent实际上是根据sqrtPriceX96算出价格，进而算出来的小数，然后向下取整得到整数。误差大约万分之零点几，不会到万分之一,因为每个tick就代表了万分之一).
11. 怎么解读info.uniswap.org提供的各个pool的流动性图？ 它完美的解释了pool.liquidity变量的计算原理。tick虽然是一个虚拟的概念，但是逻辑上却非常真实：当你创建一个position，就是在价格范围内均衡的把资金投放在每个激活的tick上。
    在流动性图中，哪个价格范围的柱子更高，则说明有更多的资金选择在这个范围内做市，也就是说这些做市商认为价格将在这个范围内来回震荡。
    另外，会有一部分人频繁的创建小范围的position,以跟踪最新市场价，这样做的好处是：能以极高的资金密集度参与做市，赚更多手续费；坏处是：为了弥补【资金容易耗尽】的缺点，需要频繁创建position，而且要把赚的钱回吐相当大一部分
    用来调平资金，才能放入新的position。这个过程损失很大，其本质是低卖高买。所以建议把position范围调的比较大，不容易失效，这不光能赚手续费还能赚到低买高卖的钱。

12. 选择更大的tickSpace，能让低买高卖的落差更大吗？？？
    不能，根本不存在低买高卖，你赚不到差价。即然如此，为什么还是要选择当做市商，而不是执行网格算法？网格算法，包含了下网、提网两个步骤，你怎么知道下跌之后一定会上涨？这本质上还是短炒、预测价格走势。
    当做市商，就是不预测，任何行情都有可能出现，做好任何打算。当价格高得离谱，就分批次套现；当价格低得离谱，就分批次抄底。而不是某些人吐槽的：我当做市商，价格越涨，就越是被动卖出，别人用廉价的币换走了我不断升值的币。说“当做市商
    能使你分批次逃顶、抄底”，前提是逃顶后要把position中的资金撤出啊，如果不撤，等跌回来，它依然帮你买入了。即然这么麻烦，还不如自己在交易所挂一些高价卖单，不也是能逃顶吗？是的，只是这样不能赚手续费。
13. 为什么更大的价格波动，对应着更大的手续费和更大的tickSpace？这仅仅是为了弥补做市商的损失吗？当你创建一个范围很大的position时，pool.ticks里面会增加很多tick。
    如果tickSpace太小，会导致tick数量过多，更多的tick遍历会消耗更多的gas。每个tick对应着万分之一的价格波动，对于一个波动很大的交易对，真的会有人在乎这万分之一的波动吗？
    答案是：大波动的交易对，没人在乎单个tick对应的万分之一波动，能减少tick数量并减少gas消耗量，为什么不减少呢。每个做市商给自己的position设定价格范围，真的需要那么精确的数字吗？越小的tickspace就能允许你设置更精确的价格、
    更小的做市范围，例如比特币的价格，你是想精确到几十美元，还是几美元？usdt-usdc的价格，肯定想精确到0.0001.因为他的波动范围不会超过1%. 该不会有人把比特币的做市范围设置在120美元吧？如果非要这样设置，就是认为比特币的波动范围
    有120美元(Visor、Lixir这样的做市商机器人应该喜欢这种策略，为了不计后果的赚取手续费。所以要想避开机器人，应该尽量到高手续费的池子)。另外，牛市波动范围大，应该用大tickSpace，这样能更加节省交易者gas费，别人更愿意来你这个池子交易。熊市后期波动范围小，应该用小tickSpace.
    其实400美元的波动，已经很小了，只波动了2%

14. 不要认为pool每天赚到的手续费会平均分给liquidity中的每一份资金。你的价格范围大，别人的小，所以你在当前tick撒的资金很少，别人却撒的很密集。所以手续费主要是别人的功劳。

15. 流动性是怎么定义的？设amountA * amountB = k ,那么L=根号k,就是流动性(这里amountA的单位是聪或伟，价格是指一聪btc等价于多少伟eth)。还能根据priceA= amountB/amountA 推导出币的数量跟价格的关系：amountA* sqrt(priceA) = L. 还能得到amountB = sqrt(priceA)*L
    如果x轴是价格，y轴是数量，那么y= L/sqrt(x)= L * x^(-1/2)，这是典型的双曲线，用eth-usdc资金池举例，随着eth的价格增加，其数量缓慢下降，并且下降的越来越慢.
    如果y轴是价格，x轴是数量,那么y= L^2/ x^2 = L^2* x^(-2)，随着池中eth数量越来越多，其价格急剧下降，但下降的速度越来越慢。

16.  Visor、Lixir、Charm Alpha Vault、Method Finance工具，能更加积极主动的管理流动性。让资金频繁调整，始终聚集在当前市场价附近。这似乎没必要，因为市场能创造的手续费有限，被这么多资金疯狂竞争，会出现严重内卷，也赚不到差价。
    最好的投资策略，既不是不预测也不是全靠预测，而是适当的预测一个范围。Visor、Lixir就属于完全不预测，或者机器预测，但是机器永远比不上人。
17. 手续费如何计算的？ pool维护了两个变量feeGrowthGlobal0X128和feeGrowthGlobal1X128，分别用来累加token0和token1在历次while循环(tick穿越)时每1单位流动性为pool赚多少手续费。计算方法是：用本次while循环中产生的手续费和
    pool.liquidity来计算出每1个流动性赚了多少手续费。全局的feeGrowthGlobal是会随着交易进行实时更新的，而position中的手续费数量tokensOwed0不会实时更新，只会在某人调用mint和burn这两个会改变流动性数量的函数时，
    触发position.update更新此人的tokensOwed0。如果用户提取手续费，那就更简单，直接在tokensOwed0上减掉提取金额。
    它怎么知道你提取了多少手续费，还剩多少手续费？原理是position.feeGrowthInside0LastX128属性记录了你上次提取手续费时的feeGrowthInside0X128快照，也就知道了从上次以来feeGrowthInside0X128增加了多少。
    feeGrowthInside0X128哪里来的？tick.getFeeGrowthInside()计算出来的： feeGrowthInside = feeGrowthGlobal - tick.feeGrowthOutside_below - tick.feeGrowthOutside_above

18. 有A、B两种币组成的交易对，给定流动性L,如何计算A的价格从pA1降到pA2，需要多少inAmountA？
    这是SqrtPriceMath.getAmount0Delta()要干的事情。答案是：分别算出两个价格对应的A币数量，记为amountA1、amountA2。 
    因为pA1>pA2，所以amountA1<amountA2, 那么inAmoutA= amountA2-amountA1. 根据恒定乘积的概念，可以根据流动性、价格，计算出此种币的数量：amountA= L/sqrt(priceA) 。推导过程如下：
    根据恒定乘积的概念：amountA1 * amountB1=k=L^2, pA1=amountB1/amountA1，两个方程抵消掉amountB1，就得到L^2/amountA1= amountA1* pA1,即：amountA1= L/sqrt(pA1)
    同理可得: amountA2= L/sqrt(pA2).   所以inAmoutA= amountA2-amountA1= L/sqrt(pA2) - L/sqrt(pA1) 。
   

19. 有A、B两种币组成的交易对，给定流动性L、当前价格pA1、A币的输入数量inAmoutA，它能把价格降到哪里？也就是求pA2，这是SqrtPriceMath.getNextSqrtPriceFromInput()要解决的。
    即然inAmoutA= L/sqrt(pA2) - L/sqrt(pA1)，那么sqrt(pA2)= L/(L/sqrt(pA1) + inAmount)



100. 在thegraph上面查询：uniswap子图：(address地址要小写，不能包含大写字母)
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