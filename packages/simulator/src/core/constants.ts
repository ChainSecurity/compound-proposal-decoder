/**
 * Shared constants used by simulation logic
 */

import {
    scrollBridgeABI,
    arbitrumBridgeABI,
    optimismBridgeABI,
    baseBridgeABI,
    mantleBridgeABI,
} from "../abis";

/**
 * Tuple types used for decoding bridged proposal messages
 */
export const TUPLE_TYPES = [
    "address[]",
    "uint256[]",
    "string[]",
    "bytes[]",
] as const;

/**
 * Bridge ABIs for each L2 chain
 */
export const bridgeABIs: Record<string, unknown[]> = {
    scroll: scrollBridgeABI,
    arbitrum: arbitrumBridgeABI,
    optimism: optimismBridgeABI,
    base: baseBridgeABI,
    mantle: mantleBridgeABI,
};

/**
 * Message index in bridge function calls for each chain
 *
 * Example for Scroll: sendMessage(address _to, uint256 _value, bytes memory _message, uint256 _gasLimit)
 * The message is at index 2.
 */
export const messageIndex: Record<string, number> = {
    scroll: 2,
    arbitrum: 7,
    optimism: 1,
    base: 1,
    mantle: 1,
};

/**
 * Gas limit warning threshold
 */
export const GAS_LIMIT = 10_000_000;
