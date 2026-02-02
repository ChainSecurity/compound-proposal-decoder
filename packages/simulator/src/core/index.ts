/**
 * Core module re-exports
 *
 * This module provides the shared simulation logic used by both
 * the CLI (main.ts) and library (simulator.ts) entry points.
 */

// Types
export type { Logger, SimulationContext, GovernanceSimulationResult } from "./types";
export { nullLogger } from "./types";

// Constants
export { TUPLE_TYPES, bridgeABIs, messageIndex, GAS_LIMIT } from "./constants";

// Proposal functions
export {
    getProposal,
    selectorOfSig,
    extractBridgedProposal,
    detectL2Chains,
    targetToL2Chain,
    parseProposalCalldata,
} from "./proposals";
export type { ProposalDetails } from "./proposals";

// Snapshot functions
export {
    SNAPSHOTS_DIR,
    getSnapshotPath,
    getRpcUrl,
    readSnapshotFile,
    writeSnapshotFile,
    getSnapshots,
    resolveSnapshotId,
    createSnapshot,
    storeSnapshotId,
} from "./snapshots";

// Simulation functions
export {
    setupDelegation,
    simulateGovernance,
    runGovernanceFlow,
    simulateBridging,
    simulateL2,
    runDirect,
    runDirectWithL2,
    submitProposalFromCalldata,
} from "./simulation";
