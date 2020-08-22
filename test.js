//keystore相关知识：https://www.jianshu.com/p/bc9ea0dc74ed

const ethers = require('ethers')
const orderService = require('./orderService')
const config = require('./config')
const util = require("./util")
const https = require('https');
/*
const myWallet= ethers.Wallet.fromMnemonic("")

 console.log(myWallet.address)
myWallet.encrypt("").then(r => console.log("JsonWallet:"+r))
*/
/*

0xB0d1435590B4f14A5f4414f93489945546162ffc
address:0xB0d1435590B4f14A5f4414f93489945546162ffc
JsonWallet:{"address":"b0d1435590b4f14a5f4414f93489945546162ffc","id":"5a63696f-1fc9-4591-9630-dcdac63dcf1e","version":3,"Crypto":{"cipher":"aes-128-ctr","cipherparams":{"iv":"0aeffda1cdfefa0a6f562aa74ede2818"},"ciphertext":"a05f204b244d12cdb393a8eba901ab01f1bf68da0bf7c0f29eeb6d6405c8f089","kdf":"scrypt","kdfparams":{"salt":"69ef4fc24f87877c2aa16ff0a22c18c31365dcc7aa350a6bf918751e0f0d3001","n":131072,"dklen":32,"p":1,"r":8},"mac":"88b47b8fb496072fd23352fd1a50f7b99d59c15e69141a686eb8135bdc83b18a"},"x-ethers":{"client":"ethers.js","gethFilename":"UTC--2020-08-10T07-30-06.0Z--b0d1435590b4f14a5f4414f93489945546162ffc","mnemonicCounter":"61238297b9e423d2975f57697dcfd834","mnemonicCiphertext":"2852e5451056a74e8a9c0d3a2bc77bd0","path":"m/44'/60'/0'/0/0","locale":"en","version":"0.1"}}

 */
/*
orderService.gasLimit_addOrder('link-eth', 'sell', '0.0406847909',
    '1', '80', '186.0', '0.05'
).then(data => console.log(data.toString())).catch(e => {
    console.log(JSON.stringify(e))
})
*/

//https://api.etherscan.io/api?module=transaction&action=getstatus&txhash=0x3b4cd40bc15ccee3f166ea92665c1992d631cc4555956bb946843bb5c9ee19cc&apikey=YourApiKeyToken
https.get(
    'https://api.etherscan.io/api?module=transaction&action=getstatus&txhash=0x3b4cd40bc15ccee3f166ea92665c1992d631cc4555956bb946843bb5c9ee19cc&apikey=YourApiKeyToken',

    res => {
        res.on('data', (d) => {
            //process.stdout.write(d+'\n');
            let result= JSON.parse(String(d))
            console.log(result.status+","+result.result.isError+","+result.result.errDescription)
        });
    }
).on('error', e => console.error(e))


