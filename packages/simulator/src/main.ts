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
import {
    GAS_LIMIT,
    getProposal,
    parseProposalCalldata,
} from "./core";
import {
    simulateFromProposal,
    type SimulationMode,
} from "./simulator";

const config = loadConfig();

// ============ CLI Parsing ============

interface CLIArgs {
    proposalId?: string;
    proposalCall?: string;
    persist: boolean;
    direct: boolean;
    noRefresh: boolean;
    deleteOld: boolean;
    backend: BackendType;
}

function printHelp(): void {
    console.log("Usage: pnpm simulate <id|0xcalldata> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --help, -h           Show this help message");
    console.log("  --persist            Persist state in --direct mode (otherwise simulates only)");
    console.log("  --direct             Execute directly from timelock (skip governance)");
    console.log("  --backend <type>     Backend to use: tenderly (default) or anvil");
    console.log("  --no-refresh         Skip refreshing Tenderly virtual testnets before simulation");
    console.log("  --delete-old         Delete old Tenderly virtual testnets before creating new ones");
    console.log("");
    console.log("Examples:");
    console.log("  pnpm simulate 524                           # Simulate with Tenderly (default)");
    console.log("  pnpm simulate 524 --backend tenderly        # Simulate with Tenderly");
    console.log("  pnpm simulate 0x7d5e81e2...                 # Simulate from calldata");
    console.log("  pnpm simulate 524 --direct                  # Execute directly from timelock");
    console.log("  pnpm simulate 524 --direct --persist        # Direct execution with persistence");
}

function getArgs(): CLIArgs {
    const args = process.argv.slice(2);

    // Check for help flag first
    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        process.exit(0);
    }

    const { positionals, values } = parseArgs({
        options: {
            persist: { type: "boolean", default: false },
            direct: { type: "boolean", default: false },
            "no-refresh": { type: "boolean", default: false },
            "delete-old": { type: "boolean", default: false },
            backend: { type: "string", default: "tenderly" },
        },
        allowPositionals: true,
        args,
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

    // Parse proposal input
    let proposalId: string | undefined;
    let proposalCall: string | undefined;
    if (positionals[0]) {
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
        proposalId,
        proposalCall,
        persist: values.persist ?? false,
        direct: values.direct ?? false,
        noRefresh: values["no-refresh"] ?? false,
        deleteOld: values["delete-old"] ?? false,
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

// ============ Command Handler ============

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
        log,  // CLI uses real logger
        { refreshTestnets: !args.noRefresh, deleteOldTestnets: args.deleteOld }
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

    if (!args.proposalId && !args.proposalCall) {
        console.error("Usage: pnpm simulate <proposalId|0xcalldata> [--direct [--persist]] [--backend <anvil|tenderly>]");
        console.error("\nOptions:");
        console.error("  --persist         Persist state in --direct mode");
        console.error("  --direct          Execute directly from timelock (skip governance)");
        console.error("  --backend <type>  Backend: tenderly (default) or anvil");
        process.exit(1);
    }

    await handleSimulate(args);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
