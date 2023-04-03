import {isSorted, Tick, TickList} from "@uniswap/v3-sdk";
import invariant from 'tiny-invariant'

/**
 *
 * @param a{Tick}
 * @param b{Tick}
 * @return {number}
 */
function tickComparator(a, b) {
    return a.index - b.index
}

/**
 * 重写了TickList, 在校验时不要求各tick的liquidityNet之和是0
 */
export class MyTickList extends TickList {
    /**
     *
     * @param ticks {Tick[]}
     * @param tickSpacing {number}
     */
    static validateList(ticks, tickSpacing) {
        invariant(tickSpacing > 0, 'TICK_SPACING_NONZERO')
        // ensure ticks are spaced appropriately
        invariant(
            ticks.every(({index}) => index % tickSpacing === 0),
            'TICK_SPACING'
        )

        // ensure tick liquidity deltas sum to 0
        // invariant(
        //     JSBI.equal(
        //         ticks.reduce((accumulator, {liquidityNet}) => JSBI.add(accumulator, liquidityNet), ZERO),
        //         ZERO
        //     ),
        //     'ZERO_NET'
        // )

        invariant(isSorted(ticks, tickComparator), 'SORTED')
    }


}