// import {BigintIsh} from '@uniswap/sdk-core'
// import {Tick, TickConstructorArgs} from '@uniswap/v3-sdk'
import {MyTickList} from "./MyTickList.js"

export class MyTickListDataProvider {
    ticks //Tick[]
    /**
     *
     * @param ticks{(Tick | TickConstructorArgs)[]}
     * @param tickSpacing{number}
     */
    constructor(ticks, tickSpacing) {
        const ticksMapped =ticks// ticks.map(t => (t instanceof Tick ? t : new Tick(t)))
        MyTickList.validateList(ticksMapped, tickSpacing)
        this.ticks = ticksMapped
    }

    /**
     *
     * @param tick{ number}
     * @return {Promise<{ liquidityNet: BigintIsh; liquidityGross: BigintIsh }>}
     */
    async getTick(tick) {
        return MyTickList.getTick(this.ticks, tick)
    }

    /**
     *
     * @param tick{number}
     * @param lte{boolean}
     * @param tickSpacing{number}
     * @return {Promise<[number, boolean]>}
     */
    async nextInitializedTickWithinOneWord(tick, lte, tickSpacing) {
        return MyTickList.nextInitializedTickWithinOneWord(this.ticks, tick, lte, tickSpacing);
    }
}