function apr(feeArr, tvl) {//fee和tvl的单位都是K
    let result = ''
    for (let fee of feeArr) {
        result += Math.round(fee * 365 / tvl * 100) + '\n'
    }
    console.log(result)
}

apr([45.23, 95.28, 84.82

    ],
    50830)


function test1(f, t) {
    console.log(1 / (1 - f - t) - 1 / (1 - f))
}

test1(0.0001, 0.003)
test1(0.0005, 0.003)
test1(0.003, 0.003)
test1(0.01, 0.003)
console.log('-------------------')
test1(0.0005, 0.001)
test1(0.0005, 0.003)
test1(0.0005, 0.005)
test1(0.0005, 0.010)