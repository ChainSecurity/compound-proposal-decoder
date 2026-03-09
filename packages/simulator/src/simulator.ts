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
    BackendType,
} from "./types";
import { loadConfig, clearConfigCache, getTenderlyApiConfig } from "./config";
import { createBackend } from "./backends";
import type { SimulationContext, Logger } from "./core/types";
import { nullLogger } from "./core/types";
import {
    getProposal,
    detectL2Chains,
    parseProposalCalldata,
    setupDelegation,
    runGovernanceFlow,
    simulateBridging,
    runDirectWithL2,
} from "./core";
import { refreshVirtualTestnets, type RefreshResult } from "./tenderly-api";

// Re-export types for library consumers
export type {
    Proposal,
    ChainExecutionResult,
    TransactionExecution,
    SimulationResult,
    Config,
    BackendType,
} from "./types";

export { refreshVirtualTestnets, refreshVirtualTestnet, type RefreshResult } from "./tenderly-api";

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

interface InitializeSimulationOptions {
    refreshTestnets?: boolean;
}

/**
 * Initialize simulation: create backend, context, and setup delegation
 */
async function initializeSimulation(
    proposal: Proposal,
    backendType: BackendType,
    logger: Logger = nullLogger,
    options?: InitializeSimulationOptions
): Promise<SimulationInit> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Detect L2 chains from proposal
    const l2Chains = detectL2Chains(proposal);
    const chainsToInitialize = ["mainnet", ...l2Chains];

    // Refresh Tenderly virtual testnets if requested (default: true for Tenderly backend)
    // This deletes old testnets and creates fresh ones for all chains.
    // If a chain doesn't have a testnet yet, one is created automatically.
    const shouldRefresh = backendType === "tenderly" && (options?.refreshTestnets ?? true);
    if (shouldRefresh) {
        const apiConfig = getTenderlyApiConfig();
        if (apiConfig) {
            await refreshVirtualTestnets(chainsToInitialize, logger);
        } else {
            logger.warn("Tenderly API not configured — skipping testnet refresh. Set tenderlyAccessToken, tenderlyAccount, and tenderlyProject in compound-config.json");
        }
    }

    // Create and initialize backend with mainnet + any L2 chains
    const backend = createBackend(backendType);
    await backend.initialize(chainsToInitialize);

    // Create simulation context with provided logger
    const ctx: SimulationContext = {
        backend,
        logger,
    };

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
    logger: Logger = nullLogger,
    options?: { refreshTestnets?: boolean }
): Promise<SimulationResult> {
    const { backend, ctx, startedAt, startTime } = await initializeSimulation(proposal, backendType, logger, options);

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
    /** Whether to refresh Tenderly virtual testnets before simulation. Default: true for Tenderly backend. */
    refreshTestnets?: boolean;
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
    const { proposalId, mode = "governance", backend: backendType = "tenderly", refreshTestnets } = options;

    // Fetch proposal from on-chain
    const tempProvider = new ethers.JsonRpcProvider(loadConfig().chains.mainnet.rpcUrl);
    const proposal = await getProposal(proposalId, tempProvider);

    return simulateFromProposal(proposal, proposalId, mode, backendType, undefined, { refreshTestnets });
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
    /** Whether to refresh Tenderly virtual testnets before simulation. Default: true for Tenderly backend. */
    refreshTestnets?: boolean;
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
    const { mode = "governance", backend: backendType = "tenderly", refreshTestnets } = options ?? {};

    // Parse the calldata to get proposal details
    const proposalDetails = parseProposalCalldata(calldata);
    const proposal: Proposal = {
        targets: proposalDetails.targets,
        values: proposalDetails.values,
        calldatas: proposalDetails.calldatas,
    };

    return simulateFromProposal(proposal, undefined, mode, backendType, undefined, { refreshTestnets });
}

export interface SimulateFromDetailsOptions {
    mode?: SimulationMode;
    backend?: BackendType;
    /** Whether to refresh Tenderly virtual testnets before simulation. Default: true for Tenderly backend. */
    refreshTestnets?: boolean;
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
    const { mode = "governance", backend: backendType = "tenderly", refreshTestnets } = options ?? {};

    const proposal: Proposal = {
        targets: details.targets,
        values: details.values,
        calldatas: details.calldatas,
    };

    return simulateFromProposal(proposal, undefined, mode, backendType, undefined, { refreshTestnets });
}

// ============ Revert Functions (Exported) ============

