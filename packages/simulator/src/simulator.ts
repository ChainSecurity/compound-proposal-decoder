/**
 * Library entry point for programmatic use of the simulator
 *
 * This file is a thin wrapper around the core simulation logic.
 * It provides a clean public API for programmatic use, using
 * nullLogger for silent operation.
 *
 * Usage:
 * ```typescript
 * import { simulateProposal } from "@compound-security/simulator";
 *
 * const result = await simulateProposal({
 *   proposalId: "527",
 *   mode: "direct",
 *   backend: "anvil", // or "tenderly"
 * });
 *
 * if (result.success) {
 *   console.log("Simulation passed!");
 * }
 * ```
 */

import { ethers } from "ethers";
import type {
    Proposal,
    ChainExecutionResult,
    SimulationResult,
    Config,
    RevertResult,
    BackendType,
} from "./types";
import { loadConfig, clearConfigCache } from "./config";
import { createBackend } from "./backends";
import type { SimulationContext, Logger } from "./core/types";
import { nullLogger } from "./core/types";
import {
    getProposal,
    detectL2Chains,
    parseProposalCalldata,
    resolveSnapshotId,
    createSnapshot,
    setupDelegation,
    runGovernanceFlow,
    simulateBridging,
    runDirectWithL2,
} from "./core";

// Re-export types for library consumers
export type {
    Proposal,
    ChainExecutionResult,
    TransactionExecution,
    SimulationResult,
    Config,
    RevertResult,
    BackendType,
} from "./types";

export type {
    SerializedTransactionExecution,
    SerializedChainExecutionResult,
    SerializedSimulationResult,
} from "./types";

export {
    serializeSimulationResult,
    deserializeSimulationResult,
    serializeChainExecutionResult,
    deserializeChainExecutionResult,
    serializeTransactionExecution,
    deserializeTransactionExecution,
} from "./serialization";

export { prettyPrint, printCompact } from "./printer";

// Re-export backend types for convenience
export { createBackend } from "./backends";
export type { Backend } from "./backends";

// Re-export core types
export type { Logger, SimulationContext } from "./core/types";
export { nullLogger } from "./core/types";
export { clearConfigCache } from "./config";

// Re-export proposal utilities
export type { ProposalDetails } from "./core/proposals";
export { parseProposalCalldata, detectL2Chains } from "./core";

// ============ Internal Helpers ============

interface SimulationInit {
    backend: import("./backends").Backend;
    ctx: SimulationContext;
    startedAt: string;
    startTime: number;
}

/**
 * Initialize simulation: create backend, context, snapshot, and setup delegation
 */
async function initializeSimulation(
    proposal: Proposal,
    backendType: BackendType,
    logger: Logger = nullLogger
): Promise<SimulationInit> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Detect L2 chains from proposal
    const l2Chains = detectL2Chains(proposal);

    // Create and initialize backend with mainnet + any L2 chains
    const backend = createBackend(backendType);
    const chainsToInitialize = ["mainnet", ...l2Chains];
    await backend.initialize(chainsToInitialize);

    // Create simulation context with provided logger
    const ctx: SimulationContext = {
        backend,
        logger,
    };

    // Create snapshot before any state changes
    await createSnapshot("mainnet", backend, logger);

    // Setup delegation for voting power
    await setupDelegation(ctx);

    return { backend, ctx, startedAt, startTime };
}

/**
 * Build the final simulation result
 */
function buildResult(
    proposalId: string | undefined,
    mode: SimulationMode,
    backendType: BackendType,
    chainResults: ChainExecutionResult[],
    startedAt: string,
    startTime: number
): SimulationResult {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    return {
        proposalId,
        success: chainResults.every(r => r.success),
        mode,
        backend: backendType,
        chainResults,
        startedAt,
        completedAt,
        durationMs,
    };
}

/**
 * Core simulation logic: takes a Proposal object and runs the simulation
 *
 * This is the unified entry point that all public API functions delegate to.
 * The flow is:
 * 1. Initialize (backend, context, snapshot, delegation) - done by caller
 * 2. Run direct mode OR governance flow
 * 3. Simulate L2 bridging if applicable
 */
async function simulateFromProposal(
    proposal: Proposal,
    proposalId: string | undefined,
    mode: SimulationMode,
    backendType: BackendType,
    logger: Logger = nullLogger
): Promise<SimulationResult> {
    const { backend, ctx, startedAt, startTime } = await initializeSimulation(proposal, backendType, logger);

    try {
        let chainResults: ChainExecutionResult[];

        if (mode === "direct" || mode === "direct-persist") {
            // Direct mode: execute from timelock
            const persist = mode === "direct-persist";
            chainResults = await runDirectWithL2(proposal, "mainnet", persist, ctx);
        } else {
            // Governance mode: full governance flow
            const mainnetResult = await runGovernanceFlow(
                proposal,
                proposalId ?? "calldata",
                "mainnet",
                ctx
            );
            chainResults = [mainnetResult];
            const l2Results = await simulateBridging(proposal, ctx);
            chainResults.push(...l2Results);
        }

        return buildResult(proposalId, mode, backendType, chainResults, startedAt, startTime);
    } finally {
        await backend.cleanup();
    }
}

// ============ Exported Internal Functions ============
// These are exported for main.ts (CLI) to use, sharing the same core logic

export type SimulationMode = "governance" | "direct" | "direct-persist";

export type { SimulationInit };
export { initializeSimulation, simulateFromProposal, buildResult };

// ============ Public API ============

export interface SimulateProposalOptions {
    proposalId: string;
    mode?: SimulationMode;
    backend?: BackendType;
}

/**
 * Simulate a Compound governance proposal
 *
 * @param options - Simulation options
 * @param options.proposalId - The proposal ID to simulate
 * @param options.mode - Simulation mode: "governance" (default), "direct", or "direct-persist"
 * @param options.backend - Backend to use: "tenderly" (default) or "anvil"
 * @returns SimulationResult with execution details for all chains
 */
export async function simulateProposal(
    options: SimulateProposalOptions
): Promise<SimulationResult> {
    const { proposalId, mode = "governance", backend: backendType = "tenderly" } = options;

    // Fetch proposal from on-chain
    const tempProvider = new ethers.JsonRpcProvider(loadConfig().chains.mainnet.rpcUrl);
    const proposal = await getProposal(proposalId, tempProvider);

    return simulateFromProposal(proposal, proposalId, mode, backendType);
}

/**
 * Get the current configuration
 */
export function getConfig(): Config {
    return loadConfig();
}

/**
 * Get available chain names
 */
export function getChainNames(): string[] {
    return Object.keys(loadConfig().chains);
}

/**
 * Proposal details for direct simulation
 */
export interface ProposalDetailsInput {
    targets: string[];
    values: bigint[];
    calldatas: string[];
    descriptionHash?: string;
}

export interface SimulateFromCalldataOptions {
    mode?: SimulationMode;
    backend?: BackendType;
}

/**
 * Simulate a proposal from raw propose() calldata
 *
 * @param calldata - The raw propose() calldata as a hex string
 * @param options - Simulation options
 * @param options.mode - Simulation mode: "governance" (default), "direct", or "direct-persist"
 * @param options.backend - Backend to use: "tenderly" (default) or "anvil"
 * @returns SimulationResult with execution details for all chains
 */
export async function simulateProposalFromCalldata(
    calldata: string,
    options?: SimulateFromCalldataOptions
): Promise<SimulationResult> {
    const { mode = "governance", backend: backendType = "tenderly" } = options ?? {};

    // Parse the calldata to get proposal details
    const proposalDetails = parseProposalCalldata(calldata);
    const proposal: Proposal = {
        targets: proposalDetails.targets,
        values: proposalDetails.values,
        calldatas: proposalDetails.calldatas,
    };

    return simulateFromProposal(proposal, undefined, mode, backendType);
}

export interface SimulateFromDetailsOptions {
    mode?: SimulationMode;
    backend?: BackendType;
}

/**
 * Simulate a proposal from explicit proposal details
 *
 * @param details - The proposal details (targets, values, calldatas)
 * @param options - Simulation options
 * @param options.mode - Simulation mode: "governance" (default), "direct", or "direct-persist"
 * @param options.backend - Backend to use: "tenderly" (default) or "anvil"
 * @returns SimulationResult with execution details for all chains
 */
export async function simulateProposalFromDetails(
    details: ProposalDetailsInput,
    options?: SimulateFromDetailsOptions
): Promise<SimulationResult> {
    const { mode = "governance", backend: backendType = "tenderly" } = options ?? {};

    const proposal: Proposal = {
        targets: details.targets,
        values: details.values,
        calldatas: details.calldatas,
    };

    return simulateFromProposal(proposal, undefined, mode, backendType);
}

// ============ Revert Functions (Exported) ============

/**
 * Get all snapshot IDs for a chain
 */
export { getSnapshots } from "./core";

/**
 * Resolve a snapshot reference to an actual snapshot ID
 */
export { resolveSnapshotId } from "./core";

/**
 * Revert a single chain to a snapshot
 *
 * @param chain - The chain name to revert
 * @param snapshotRef - Snapshot reference (default: "latest")
 * @param backendType - Backend to use: "tenderly" (default for revert, since Anvil is ephemeral)
 * @returns RevertResult with success status and details
 */
export async function revertChain(
    chain: string,
    snapshotRef?: string,
    backendType: BackendType = "tenderly"
): Promise<RevertResult> {
    if (backendType === "anvil") {
        return {
            chain,
            success: false,
            error: "Anvil backend does not support persistent snapshots. Use tenderly backend for revert operations.",
        };
    }

    const backend = createBackend(backendType);
    await backend.initialize([chain]);

    try {
        const snapshotId = resolveSnapshotId(chain, snapshotRef);
        if (!snapshotId) {
            return {
                chain,
                success: false,
                error: `No snapshot found for ${chain} (ref: ${snapshotRef ?? "latest"})`,
            };
        }

        const result = await backend.revert(chain, snapshotId);
        return {
            chain,
            success: result,
            snapshotId,
            error: result ? undefined : "evm_revert returned false",
        };
    } catch (error) {
        return {
            chain,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        await backend.cleanup();
    }
}

/**
 * Revert multiple chains to their snapshots
 *
 * @param chains - Array of chain names to revert
 * @param snapshotRef - Snapshot reference for all chains (default: "latest")
 * @param backendType - Backend to use: "tenderly" (default)
 * @returns Array of RevertResult for each chain
 */
export async function revertChains(
    chains: string[],
    snapshotRef?: string,
    backendType: BackendType = "tenderly"
): Promise<RevertResult[]> {
    const results: RevertResult[] = [];
    for (const chain of chains) {
        const result = await revertChain(chain, snapshotRef, backendType);
        results.push(result);
    }
    return results;
}

/**
 * Revert all configured chains to their snapshots
 *
 * @param snapshotRef - Snapshot reference for all chains (default: "latest")
 * @param backendType - Backend to use: "tenderly" (default)
 * @returns Array of RevertResult for each chain
 */
export async function revertAllChains(
    snapshotRef?: string,
    backendType: BackendType = "tenderly"
): Promise<RevertResult[]> {
    const chains = Object.keys(loadConfig().chains);
    return revertChains(chains, snapshotRef, backendType);
}
