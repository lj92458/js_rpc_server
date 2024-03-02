import {Big} from './util.js'
import JSBI from "jsbi";

let i = 0, n = 3, infoArr = [1, 2, 3, 4, 5, 6, 7];
for (; i < Math.floor(infoArr.length / n); i++) console.log(infoArr.slice(i * n, (i + 1) * n));
if (infoArr.length % n > 0) console.log(infoArr.slice(i * n));

let a = JSBI.GE(JSBI.BigInt('10'), '11')
console.log(a)

let arr = [1, 3, 2];
console.log(arr.sort((o1, o2) => o1 - o2))