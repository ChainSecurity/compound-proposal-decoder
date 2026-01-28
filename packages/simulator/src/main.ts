/**
 * CLI entry point for the proposal simulator
 *
 * This file is a thin wrapper around the core simulation logic.
 * It handles CLI argument parsing and command routing, delegating
 * actual simulation work to the shared simulateFromProposal function.
 */

import { ethers } from "ethers";
import process from "node:process";
import { parseArgs } from "node:util";
import { log } from "./logger";
import type {
    Proposal,
    BackendType,
} from "./types";
import { prettyPrint } from "./printer";
import { loadConfig } from "./config";
import { createBackend, type Backend } from "./backends";
import {
    GAS_LIMIT,
    getProposal,
    getSnapshots,
    resolveSnapshotId,
    createSnapshot,
    parseProposalCalldata,
} from "./core";
import {
    simulateFromProposal,
    type SimulationMode,
} from "./simulator";

const config = loadConfig();

// ============ CLI Parsing ============

type Command = "simulate" | "revert" | "snapshot" | "list";

interface CLIArgs {
    command: Command;
    proposalId?: string;
    proposalCall?: string;
    persist: boolean;
    direct: boolean;
    all: boolean;
    snapshot?: string;
    chain?: string;
    backend: BackendType;
}

function printHelp(): void {
    console.log("Usage: pnpm simulate [command] [options]");
    console.log("");
    console.log("Commands:");
    console.log("  simulate <id|0xcalldata>  Simulate a proposal (default)");
    console.log("  revert                    Revert mainnet to snapshot (use --all for all chains)");
    console.log("  snapshot                  Create snapshots for all chains");
    console.log("  list                      List available snapshots");
    console.log("");
    console.log("Options:");
    console.log("  --help, -h           Show this help message");
    console.log("  --persist            Persist state in --direct mode (otherwise simulates only)");
    console.log("  --direct             Execute directly from timelock (skip governance)");
    console.log("  --all                Revert all chains (for revert command)");
    console.log("  --snapshot <ref>     Snapshot reference (latest, -1, -2, or hash)");
    console.log("  --chain <name>       Target specific chain");
    console.log("  --backend <type>     Backend to use: tenderly (default) or anvil");
    console.log("");
    console.log("Examples:");
    console.log("  pnpm simulate 524                           # Simulate with Tenderly (default)");
    console.log("  pnpm simulate 524 --backend tenderly        # Simulate with Tenderly");
    console.log("  pnpm simulate 0x7d5e81e2...                 # Simulate from calldata");
    console.log("  pnpm simulate 524 --direct                  # Execute directly from timelock");
    console.log("  pnpm simulate 524 --direct --persist        # Direct execution with persistence");
    console.log("  pnpm simulate revert                        # Revert mainnet to snapshot");
    console.log("  pnpm simulate revert --all                  # Revert all chains to snapshot");
    console.log("  pnpm simulate list                          # List all snapshots");
}

function getArgs(): CLIArgs {
    const args = process.argv.slice(2);

    // Check for help flag first
    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    // Detect command (default: simulate for backwards compat)
    let command: Command = "simulate";
    let rest = args;
    if (args[0] && ["simulate", "revert", "snapshot", "list"].includes(args[0])) {
        command = args[0] as Command;
        rest = args.slice(1);
    }

    const { positionals, values } = parseArgs({
        options: {
            persist: { type: "boolean", default: false },
            direct: { type: "boolean", default: false },
            all: { type: "boolean", default: false },
            snapshot: { type: "string" },
            chain: { type: "string" },
            backend: { type: "string", default: "tenderly" },
        },
        allowPositionals: true,
        args: rest,
    });

    // Validate backend option
    const backendValue = values.backend as string;
    if (backendValue !== "anvil" && backendValue !== "tenderly") {
        console.error(`Invalid backend "${backendValue}". Must be "anvil" or "tenderly".`);
        process.exit(1);
    }
    const backend = backendValue as BackendType;

    if (values.persist) {
        log.plain("Mode: persist");
    }
    if (values.direct) {
        log.plain("Mode: direct");
    }
    log.plain(`Backend: ${backend}`);

    // Parse proposal input for simulate command
    let proposalId: string | undefined;
    let proposalCall: string | undefined;
    if (command === "simulate" && positionals[0]) {
        const raw = positionals[0];
        if (raw.startsWith("0x") && raw.length > 10) {
            proposalCall = raw;
        } else {
            try {
                BigInt(raw);
                proposalId = raw;
            } catch {
                console.error(`Invalid proposal id "${raw}". Provide a decimal or hex value.`);
                process.exit(1);
            }
        }
    }

    return {
        command,
        proposalId,
        proposalCall,
        persist: values.persist ?? false,
        direct: values.direct ?? false,
        all: values.all ?? false,
        snapshot: values.snapshot,
        chain: values.chain,
        backend,
    };
}

// ============ Helper Functions ============

/**
 * Determine the simulation mode from CLI args
 */
function determineMode(args: CLIArgs): SimulationMode {
    if (args.direct && args.persist) {
        return "direct-persist";
    } else if (args.direct) {
        return "direct";
    }
    return "governance";
}

/**
 * Resolve proposal from CLI args (either by ID or from calldata)
 */
async function resolveProposal(args: CLIArgs): Promise<{ proposal: Proposal; proposalId: string | undefined }> {
    if (args.proposalCall) {
        // Parse proposal from calldata
        const proposalDetails = parseProposalCalldata(args.proposalCall);
        const proposal: Proposal = {
            targets: proposalDetails.targets,
            values: proposalDetails.values,
            calldatas: proposalDetails.calldatas,
        };
        return { proposal, proposalId: undefined };
    } else if (args.proposalId) {
        // Fetch proposal from on-chain
        const tempProvider = new ethers.JsonRpcProvider(config.chains.mainnet.rpcUrl);
        const proposal = await getProposal(args.proposalId, tempProvider);
        return { proposal, proposalId: args.proposalId };
    }
    throw new Error("No valid proposal source provided");
}

/**
 * Print gas warnings for chain results
 */
function printGasWarnings(chainResults: { chain: string; totalGasUsed?: bigint }[]): void {
    for (const chainResult of chainResults) {
        if (chainResult.totalGasUsed && chainResult.totalGasUsed > BigInt(GAS_LIMIT)) {
            log.warn(`Gas consumption on ${chainResult.chain} exceeds ${GAS_LIMIT.toLocaleString()}`);
        }
    }
}

// ============ Command Handlers ============

async function revertChain(chain: string, snapshotRef: string | undefined, backend: Backend): Promise<boolean> {
    if (!backend.supportsPersistentSnapshots()) {
        log.warn(`Backend ${backend.name} does not support persistent snapshots. Revert skipped for ${chain}.`);
        return false;
    }

    const snapshotId = resolveSnapshotId(chain, snapshotRef);
    if (!snapshotId) {
        log.warn(`No snapshot found for ${chain} (ref: ${snapshotRef ?? 'latest'})`);
        return false;
    }
    try {
        const result = await backend.revert(chain, snapshotId);
        log.done(`Reverted ${chain} to ${snapshotId}`);
        return result;
    } catch (error) {
        log.error(`Failed to revert ${chain}: ${error}`);
        return false;
    }
}

async function handleRevert(args: CLIArgs, backend: Backend): Promise<void> {
    if (!backend.supportsPersistentSnapshots()) {
        log.warn(`Backend ${backend.name} does not support persistent snapshots. Use --backend tenderly for revert operations.`);
        return;
    }

    let chains: string[];
    if (args.chain) {
        chains = [args.chain];
    } else if (args.all) {
        chains = Object.keys(config.chains);
    } else {
        chains = ["mainnet"];
    }
    for (const chain of chains) {
        await revertChain(chain, args.snapshot, backend);
    }
}

async function handleSnapshot(args: CLIArgs, backend: Backend): Promise<void> {
    const chains = args.chain ? [args.chain] : Object.keys(config.chains);
    for (const chain of chains) {
        await createSnapshot(chain, backend, log);
    }
}

function handleList(args: CLIArgs): void {
    const chains = args.chain ? [args.chain] : Object.keys(config.chains);
    for (const chain of chains) {
        const snapshots = getSnapshots(chain);
        console.log(`\n${chain} (${snapshots.length} snapshots):`);
        if (snapshots.length === 0) {
            console.log("  (none)");
        } else {
            snapshots.slice(-5).forEach((s, i, arr) => {
                const isLatest = i === arr.length - 1 ? " (latest)" : "";
                console.log(`  ${s}${isLatest}`);
            });
            if (snapshots.length > 5) {
                console.log(`  ... and ${snapshots.length - 5} more`);
            }
        }
    }
}

/**
 * Handle the simulate command using the shared simulateFromProposal function
 */
async function handleSimulate(args: CLIArgs): Promise<void> {
    // Resolve proposal from CLI args
    const { proposal, proposalId } = await resolveProposal(args);

    // Determine simulation mode
    const mode = determineMode(args);

    // Use the SAME function as simulator.ts, just with real logger
    const result = await simulateFromProposal(
        proposal,
        proposalId,
        mode,
        args.backend,
        log  // CLI uses real logger
    );

    // CLI-specific output
    prettyPrint(result);
    printGasWarnings(result.chainResults);

    if (!result.success) {
        process.exit(1);
    }
}

// ============ Main Execution ============

async function main() {
    const args = getArgs();

    // For list command, no backend needed
    if (args.command === "list") {
        handleList(args);
        process.exit(0);
    }

    // Simulate command requires proposal input
    if (args.command === "simulate") {
        if (!args.proposalId && !args.proposalCall) {
            console.error("Usage: pnpm simulate [simulate] <proposalId|0xcalldata> [--direct [--persist]] [--backend <anvil|tenderly>]");
            console.error("\nCommands:");
            console.error("  simulate <id>     Simulate a proposal (default)");
            console.error("  revert            Revert all chains to snapshot");
            console.error("  snapshot          Create snapshots for all chains");
            console.error("  list              List available snapshots");
            console.error("\nOptions:");
            console.error("  --persist         Persist state in --direct mode");
            console.error("  --direct          Execute directly from timelock (skip governance)");
            console.error("  --snapshot <ref>  Snapshot reference (latest, -1, -2, or hash)");
            console.error("  --chain <name>    Target specific chain");
            console.error("  --backend <type>  Backend: tenderly (default) or anvil");
            process.exit(1);
        }

        // Simulate command is handled specially - it manages its own backend
        await handleSimulate(args);
        process.exit(0);
    }

    // For revert/snapshot commands, create and manage backend here
    let chainsToInitialize: string[] = ["mainnet"];
    if (args.chain) {
        chainsToInitialize = [args.chain];
    } else if (args.all) {
        chainsToInitialize = Object.keys(config.chains);
    }

    const backend = createBackend(args.backend);
    await backend.initialize(chainsToInitialize);

    try {
        if (args.command === "revert") {
            await handleRevert(args, backend);
        } else if (args.command === "snapshot") {
            await handleSnapshot(args, backend);
        }
    } finally {
        await backend.cleanup();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
