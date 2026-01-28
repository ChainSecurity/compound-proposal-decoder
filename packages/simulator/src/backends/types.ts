/**
 * Backend interface for simulation engines (Tenderly, Anvil, etc.)
 *
 * This abstraction allows the simulator to work with different EVM simulation
 * backends that have different RPC methods for state manipulation.
 */

import type { ethers } from "ethers";

export type BackendType = "anvil" | "tenderly";

/**
 * Transaction parameters for simulation
 */
export interface TransactionParams {
    from: string;
    to: string;
    gas?: string;
    gasPrice?: string;
    value?: string;
    data?: string;
}

/**
 * Result of a single transaction in a bundle simulation
 */
export interface BundleTransactionResult {
    success: boolean;
    gasUsed?: bigint;
    txHash?: string;
    revertReason?: string;
}

/**
 * Options for mining a block
 */
export interface MineBlockOptions {
    /** Target timestamp for the block */
    timestamp?: number;
    /** Target block number */
    blockNumber?: number;
}

/**
 * Options for initializing a backend
 */
export interface BackendInitOptions {
    /** Map of chain name to fork block number (for Anvil) */
    forkBlocks?: Record<string, number>;
}

/**
 * Backend interface for EVM simulation engines
 *
 * Implementations abstract away the differences between simulation backends
 * like Tenderly (cloud-based) and Anvil (local Foundry).
 */
export interface Backend {
    /** Backend identifier */
    readonly name: BackendType;

    /**
     * Initialize the backend for the specified chains
     *
     * For Tenderly: Creates providers using existing RPC URLs
     * For Anvil: Spawns Anvil processes with fork URLs
     *
     * @param chains - Array of chain names to initialize (e.g., ["mainnet", "arbitrum"])
     * @param options - Optional initialization options (fork blocks, etc.)
     */
    initialize(chains: string[], options?: BackendInitOptions): Promise<void>;

    /**
     * Cleanup backend resources
     *
     * For Tenderly: No-op (stateless)
     * For Anvil: Kills spawned processes
     */
    cleanup(): Promise<void>;

    /**
     * Get the ethers provider for a chain
     *
     * @param chain - Chain name (e.g., "mainnet")
     * @returns ethers JsonRpcProvider for the chain
     * @throws Error if chain is not initialized
     */
    getProvider(chain: string): ethers.JsonRpcProvider;

    /**
     * Set storage at a specific slot
     *
     * Tenderly: tenderly_setStorageAt
     * Anvil: anvil_setStorageAt
     *
     * @param chain - Chain name
     * @param address - Contract address
     * @param slot - Storage slot (hex string)
     * @param value - Value to set (hex string, 32 bytes)
     */
    setStorageAt(chain: string, address: string, slot: string, value: string): Promise<void>;

    /**
     * Mine a block with optional timestamp/block number
     *
     * Tenderly: tenderly_mineBlock
     * Anvil: evm_setNextBlockTimestamp + evm_mine or anvil_mine
     *
     * @param chain - Chain name
     * @param options - Optional timestamp and/or block number
     */
    mineBlock(chain: string, options?: MineBlockOptions): Promise<void>;

    /**
     * Advance time by a number of seconds
     *
     * @param chain - Chain name
     * @param seconds - Number of seconds to advance
     */
    advanceTime(chain: string, seconds: number): Promise<void>;

    /**
     * Impersonate an account for transaction sending
     *
     * Tenderly: Automatic (any from address works)
     * Anvil: anvil_impersonateAccount
     *
     * @param chain - Chain name
     * @param address - Address to impersonate
     */
    impersonateAccount(chain: string, address: string): Promise<void>;

    /**
     * Stop impersonating an account
     *
     * Tenderly: No-op
     * Anvil: anvil_stopImpersonatingAccount
     *
     * @param chain - Chain name
     * @param address - Address to stop impersonating
     */
    stopImpersonating(chain: string, address: string): Promise<void>;

    /**
     * Simulate a bundle of transactions without persisting state
     *
     * Tenderly: tenderly_simulateBundle
     * Anvil: snapshot + execute + revert (maintains read-only semantics)
     *
     * @param chain - Chain name
     * @param transactions - Array of transaction parameters
     * @returns Array of results for each transaction
     */
    simulateBundle(chain: string, transactions: TransactionParams[]): Promise<BundleTransactionResult[]>;

    /**
     * Create an EVM snapshot
     *
     * @param chain - Chain name
     * @returns Snapshot ID
     */
    snapshot(chain: string): Promise<string>;

    /**
     * Revert to a snapshot
     *
     * @param chain - Chain name
     * @param snapshotId - Snapshot ID to revert to
     * @returns true if successful
     */
    revert(chain: string, snapshotId: string): Promise<boolean>;

    /**
     * Check if this backend supports persistent snapshots across sessions
     *
     * Tenderly: true (virtual testnets persist)
     * Anvil: false (ephemeral, state lost when process exits)
     */
    supportsPersistentSnapshots(): boolean;

    /**
     * Send a raw transaction from an impersonated account
     *
     * @param chain - Chain name
     * @param tx - Transaction parameters
     * @returns Transaction hash
     */
    sendTransaction(chain: string, tx: TransactionParams): Promise<string>;
}
