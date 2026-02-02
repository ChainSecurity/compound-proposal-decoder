/**
 * Patch for Proposal 524 (Ronin)
 *
 * Updates CCIP price timestamps to avoid staleness reverts when simulating
 * proposal 524 which targets the Ronin chain via CCIP.
 */

import { ethers, AbiCoder } from "ethers";
import type { Backend } from "../backends/types";

const coder = AbiCoder.defaultAbiCoder();

// CCIP PriceRegistry address on mainnet
const CCIP_PRICE_REGISTRY = "0x8c9b2efb7c64c394119270bfece7f54763b958ad";
// Ronin chain selector
const RONIN_CHAIN_SELECTOR = 6916147374840168594n;
// Storage slot for s_usdPerUnitGasByDestChainSelector mapping (slot 2 in PriceRegistry)
const GAS_PRICE_MAPPING_SLOT = 2n;
// Storage slot for s_usdPerToken mapping (slot 3 in PriceRegistry)
const TOKEN_PRICE_MAPPING_SLOT = 3n;
// WETH address
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
// LINK address
const LINK_ADDRESS = "0x514910771af9ca656af840dff83e8264ecf986ca";

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
    console.log(`Current ${label} storage:`, currentValue);

    const block = await provider.getBlock("latest");
    const newTimestamp = BigInt(block!.timestamp);

    const currentBigInt = BigInt(currentValue);
    const valueMask = (1n << 224n) - 1n;
    const value = currentBigInt & valueMask;
    const newPacked = (newTimestamp << 224n) | value;

    const newValueHex = "0x" + newPacked.toString(16).padStart(64, "0");
    await backend.setStorageAt(chain, contract, slot, newValueHex);
    console.log(`Updated ${label} timestamp to:`, newTimestamp);
}

// Update CCIP price timestamps to avoid staleness reverts
async function updateCCIPPriceTimestamps(backend: Backend, chain: string, chainSelector: bigint) {
    // Update gas price for destination chain
    const gasPriceSlot = getMappingSlotUint(chainSelector, GAS_PRICE_MAPPING_SLOT);
    await updateTimestampedStorage(backend, chain, CCIP_PRICE_REGISTRY, gasPriceSlot, "CCIP gas price");

    // Update WETH token price (used for fee calculation)
    const wethPriceSlot = getMappingSlotAddress(WETH_ADDRESS, TOKEN_PRICE_MAPPING_SLOT);
    await updateTimestampedStorage(backend, chain, CCIP_PRICE_REGISTRY, wethPriceSlot, "WETH token price");

    // Update LINK token price (used for fee calculation)
    const linkPriceSlot = getMappingSlotAddress(LINK_ADDRESS, TOKEN_PRICE_MAPPING_SLOT);
    await updateTimestampedStorage(backend, chain, CCIP_PRICE_REGISTRY, linkPriceSlot, "LINK token price");
}

/**
 * Apply patch for proposal 524 (Ronin).
 * Updates CCIP price timestamps to avoid staleness reverts.
 *
 * @param backend - The simulation backend
 * @param chain - The chain to apply the patch on (default: "mainnet")
 */
export async function applyPatch524(backend: Backend, chain: string = "mainnet"): Promise<void> {
    console.log("Applying patch for proposal 524 (Ronin CCIP timestamps)...");
    await updateCCIPPriceTimestamps(backend, chain, RONIN_CHAIN_SELECTOR);
}

/**
 * Legacy function signature for backwards compatibility.
 * Creates a simple wrapper backend around the provider.
 *
 * @deprecated Use the Backend-based version instead
 */
export async function applyPatch524Legacy(provider: ethers.JsonRpcProvider): Promise<void> {
    console.log("Applying patch for proposal 524 (Ronin CCIP timestamps)...");

    // Use direct provider calls for legacy compatibility
    const updateTimestampedStorageLegacy = async (
        contract: string,
        slot: string,
        label: string
    ) => {
        const currentValue = await provider.send("eth_getStorageAt", [contract, slot, "latest"]);
        console.log(`Current ${label} storage:`, currentValue);

        const block = await provider.getBlock("latest");
        const newTimestamp = BigInt(block!.timestamp);

        const currentBigInt = BigInt(currentValue);
        const valueMask = (1n << 224n) - 1n;
        const value = currentBigInt & valueMask;
        const newPacked = (newTimestamp << 224n) | value;

        const newValueHex = "0x" + newPacked.toString(16).padStart(64, "0");
        await provider.send("tenderly_setStorageAt", [contract, slot, newValueHex]);
        console.log(`Updated ${label} timestamp to:`, newTimestamp);
    };

    // Update gas price for destination chain
    const gasPriceSlot = getMappingSlotUint(RONIN_CHAIN_SELECTOR, GAS_PRICE_MAPPING_SLOT);
    await updateTimestampedStorageLegacy(CCIP_PRICE_REGISTRY, gasPriceSlot, "CCIP gas price");

    // Update WETH token price (used for fee calculation)
    const wethPriceSlot = getMappingSlotAddress(WETH_ADDRESS, TOKEN_PRICE_MAPPING_SLOT);
    await updateTimestampedStorageLegacy(CCIP_PRICE_REGISTRY, wethPriceSlot, "WETH token price");

    // Update LINK token price (used for fee calculation)
    const linkPriceSlot = getMappingSlotAddress(LINK_ADDRESS, TOKEN_PRICE_MAPPING_SLOT);
    await updateTimestampedStorageLegacy(CCIP_PRICE_REGISTRY, linkPriceSlot, "LINK token price");
}
