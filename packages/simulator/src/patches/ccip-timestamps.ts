/**
 * Generic CCIP Timestamp Patch
 *
 * Auto-detects proposals that target the Chainlink CCIP Router, extracts
 * destination chain selectors, and updates CCIP PriceRegistry timestamps
 * to avoid staleness reverts during simulation (where governance time
 * advancement makes timestamps ~2 weeks stale).
 */

import { ethers, AbiCoder, Interface } from "ethers";
import type { Backend } from "../backends/types";
import type { Proposal } from "../types";

const coder = AbiCoder.defaultAbiCoder();

// CCIP Router address on mainnet
const CCIP_ROUTER = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";

// CCIP PriceRegistry address on mainnet
const CCIP_PRICE_REGISTRY = "0x8c9b2efb7c64c394119270bfece7f54763b958ad";

// Storage slot for s_usdPerUnitGasByDestChainSelector mapping (slot 2 in PriceRegistry)
const GAS_PRICE_MAPPING_SLOT = 2n;
// Storage slot for s_usdPerToken mapping (slot 3 in PriceRegistry)
const TOKEN_PRICE_MAPPING_SLOT = 3n;
// WETH address
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
// LINK address
const LINK_ADDRESS = "0x514910771af9ca656af840dff83e8264ecf986ca";

// Interface for parsing ccipSend calls
const ccipIface = new Interface([
    "function ccipSend(uint64 destinationChainSelector, tuple(bytes receiver, bytes data, tuple(address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) external payable returns (bytes32)",
]);

interface CCIPCallInfo {
    chainSelector: bigint;
    tokenAddresses: string[];
}

/**
 * Detect CCIP calls from a proposal's targets and calldatas.
 * Returns chain selectors and token addresses for all ccipSend calls found.
 */
function detectCCIPCalls(proposal: Proposal): CCIPCallInfo[] {
    const calls: CCIPCallInfo[] = [];
    for (let i = 0; i < proposal.targets.length; i++) {
        if (proposal.targets[i]!.toLowerCase() === CCIP_ROUTER.toLowerCase()) {
            try {
                const parsed = ccipIface.parseTransaction({ data: proposal.calldatas[i]! });
                if (parsed) {
                    const chainSelector = BigInt(parsed.args[0]);
                    const message = parsed.args[1];
                    // message.tokenAmounts is tuple(address token, uint256 amount)[]
                    const tokenAddresses: string[] = [];
                    for (const tokenAmount of message.tokenAmounts) {
                        tokenAddresses.push(tokenAmount.token.toLowerCase());
                    }
                    // Also include feeToken if it's not address(0)
                    const feeToken = message.feeToken;
                    if (feeToken && feeToken !== ethers.ZeroAddress) {
                        tokenAddresses.push(feeToken.toLowerCase());
                    }
                    calls.push({ chainSelector, tokenAddresses });
                }
            } catch {
                // Not a ccipSend call, skip
            }
        }
    }
    return calls;
}

// Calculate storage slot for a mapping key (uint256 key)
function getMappingSlotUint(key: bigint, mappingSlot: bigint): string {
    const encoded = coder.encode(["uint256", "uint256"], [key, mappingSlot]);
    return ethers.keccak256(encoded);
}

// Calculate storage slot for a mapping key (address key)
function getMappingSlotAddress(key: string, mappingSlot: bigint): string {
    const encoded = coder.encode(["address", "uint256"], [key, mappingSlot]);
    return ethers.keccak256(encoded);
}

// Update a TimestampedPackedUint224 storage slot with new timestamp
async function updateTimestampedStorage(
    backend: Backend,
    chain: string,
    contract: string,
    slot: string,
    label: string
) {
    const provider = backend.getProvider(chain);
    const currentValue = await provider.send("eth_getStorageAt", [contract, slot, "latest"]);

    const block = await provider.getBlock("latest");
    const newTimestamp = BigInt(block!.timestamp);

    const currentBigInt = BigInt(currentValue);
    const valueMask = (1n << 224n) - 1n;
    const value = currentBigInt & valueMask;
    const newPacked = (newTimestamp << 224n) | value;

    const newValueHex = "0x" + newPacked.toString(16).padStart(64, "0");
    await backend.setStorageAt(chain, contract, slot, newValueHex);
    console.log(`Updated ${label} timestamp to ${newTimestamp}`);
}

// Update CCIP price timestamps for a given chain selector and token set
async function updateCCIPPriceTimestamps(
    backend: Backend, chain: string, chainSelector: bigint, extraTokens: string[]
) {
    // Update gas price for destination chain
    const gasPriceSlot = getMappingSlotUint(chainSelector, GAS_PRICE_MAPPING_SLOT);
    await updateTimestampedStorage(backend, chain, CCIP_PRICE_REGISTRY, gasPriceSlot, "CCIP gas price");

    // Collect all token addresses to update: WETH, LINK, plus any tokens from the ccipSend call
    const allTokens = new Set([
        WETH_ADDRESS.toLowerCase(),
        LINK_ADDRESS.toLowerCase(),
        ...extraTokens.map(t => t.toLowerCase()),
    ]);

    for (const token of allTokens) {
        const slot = getMappingSlotAddress(token, TOKEN_PRICE_MAPPING_SLOT);
        await updateTimestampedStorage(backend, chain, CCIP_PRICE_REGISTRY, slot, `token ${token} price`);
    }
}

/**
 * Auto-detect CCIP proposals and apply timestamp patches.
 *
 * Inspects proposal targets/calldatas for ccipSend calls to the CCIP Router,
 * extracts destination chain selectors, and updates PriceRegistry timestamps
 * to avoid staleness reverts.
 *
 * No-op if the proposal doesn't target the CCIP Router.
 */
export async function applyCCIPTimestampPatches(
    backend: Backend,
    chain: string,
    proposal: Proposal
): Promise<void> {
    const calls = detectCCIPCalls(proposal);
    if (calls.length === 0) return;

    console.log(`Applying CCIP timestamp patches for ${calls.length} ccipSend call(s)...`);
    for (const call of calls) {
        await updateCCIPPriceTimestamps(backend, chain, call.chainSelector, call.tokenAddresses);
    }
}
