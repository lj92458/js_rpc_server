import {ethers} from "ethers"

const defaultApiKey = "EVTS3CU31AATZV72YQ55TPGXGMVIFUQ9M9"
const logger = new ethers.utils.Logger('0.0.1')
const networks = [
    {name: "arbitrum-one", chainId: 42161},
    {name: "arbitrum-nova", chainId: 42170},
    {name: "arbitrum-goerli", chainId: 421611},
]

export class ScanProvider extends ethers.providers.EtherscanProvider {
    /**
     *
     * @param network{ethers.providers.Networkish}
     * @param apiKey{string}
     */
    constructor(network, apiKey) {
        const standardNetwork = getNetwork((network == null) ? "arbitrum-one" : network)

        switch ((standardNetwork || {}).name) {
            case "arbitrum-one":
            case "arbitrum-nova":
            case "arbitrum-goerli":
                break
            default:
                logger.throwError("unsupported network", ethers.utils.Logger.errors.UNSUPPORTED_OPERATION, {network})
        }
        super(standardNetwork, apiKey || defaultApiKey)
    }

    getBaseUrl() {
        switch (this.network ? this.network.name : "invalid") {
            case "arbitrum-one":
                return "https:/\/api.arbiscan.io"
            case "arbitrum-nova":
                return "https:/\/api-nova.arbiscan.io"
            case "arbitrum-goerli":
                return "https:/\/api-goerli.arbiscan.io"
        }
        return logger.throwArgumentError("unsupported network", "network", this.network)
    }

    isCommunityResource() {
        return (this.apiKey === defaultApiKey)
    }

}

/**
 *
 * @param network {ethers.providers.Networkish}
 * @return {ethers.providers.Networkish|null}
 */
export function getNetwork(network) {
    if (network == null) {
        return null
    }

    // Chain ID
    if (typeof (network) === "number") {
        const matches = networks.filter((n) => (n.chainId === network))
        if (matches.length) return matches[0]
        return {name: "unknown", chainId: network}
    }

    // Chain name
    if (typeof (network) === "string") {
        const matches = networks.filter((n) => (n.name === network))
        if (matches.length) return matches[0]
        return null
    }

    if (typeof (network.name) === "string" && typeof (network.chainId) === "number") {
        const byName = getNetwork(network.name)
        const byChainId = getNetwork(network.chainId)
        // Nothing standard valid custom network
        if (byName == null && byChainId == null) {
            return {name: network.name, chainId: network.chainId}
        }
        // Make sure if it is a standard chain the parameters match
        if (byName && byChainId && byName.name === byChainId.name && byName.chainId === byChainId.chainId) {
            return byName
        }
    }
    return logger.throwArgumentError("network chainId mismatch", "network", network)
}
