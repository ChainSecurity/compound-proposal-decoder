/**
 * Proposal fetching and parsing utilities
 */

import { ethers, AbiCoder, Interface, id } from "ethers";
import { governorABI } from "../abis";
import { zip } from "../utils";
import { loadConfig } from "../config";
import type { Proposal } from "../types";
import { TUPLE_TYPES, bridgeABIs, messageIndex } from "./constants";

const config = loadConfig();
const coder = AbiCoder.defaultAbiCoder();

/**
 * Fetch proposal details from the governor contract
 */
export async function getProposal(
    proposalId: string,
    provider: ethers.JsonRpcProvider
): Promise<Proposal> {
    const governor = new ethers.Contract(
        config.chains.mainnet.governorAddress!,
        governorABI,
        provider,
    );

    const proposal = await governor.proposalDetails(proposalId);
    return {
        targets: proposal[0],
        values: proposal[1],
        calldatas: proposal[2],
    };
}

/**
 * Get the function selector from a signature
 */
export function selectorOfSig(sig: string): string {
    return id(sig).slice(0, 10);
}

/**
 * Extract the bridged proposal from a bridge call's calldata
 */
export function extractBridgedProposal(calldata: string, chain: string): Proposal {
    if (!bridgeABIs[chain]) {
        throw new Error(`Missing ABI for ${chain}`);
    }
    if (messageIndex[chain] === undefined) {
        throw new Error(`Missing messageIndex for ${chain}`);
    }

    const iface = new Interface(bridgeABIs[chain] as ethers.InterfaceAbi);
    const bridgeCall = iface.parseTransaction({ data: calldata });
    const decodedProposal = coder.decode(
        TUPLE_TYPES,
        bridgeCall!.args[messageIndex[chain]!],
    );

    const calldatas = zip(decodedProposal[2] as string[], decodedProposal[3] as string[]).map(
        (entry) => selectorOfSig(entry[0]) + entry[1].slice(2),
    );

    return {
        targets: decodedProposal[0] as string[],
        values: decodedProposal[1] as bigint[],
        calldatas,
    };
}

/**
 * Detect which L2 chains are targeted by a proposal
 */
export function detectL2Chains(proposal: Proposal): string[] {
    const chains: string[] = [];
    for (const target of proposal.targets) {
        if (target === config.chains.scroll?.bridge) chains.push("scroll");
        else if (target === config.chains.arbitrum?.bridge) chains.push("arbitrum");
        else if (target === config.chains.optimism?.bridge) chains.push("optimism");
        else if (target === config.chains.base?.bridge) chains.push("base");
        else if (target === config.chains.mantle?.bridge) chains.push("mantle");
    }
    return [...new Set(chains)]; // Remove duplicates
}

/**
 * Map a target address to its L2 chain name
 */
export function targetToL2Chain(target: string): string | undefined {
    if (target === config.chains.scroll?.bridge) return "scroll";
    if (target === config.chains.arbitrum?.bridge) return "arbitrum";
    if (target === config.chains.optimism?.bridge) return "optimism";
    if (target === config.chains.base?.bridge) return "base";
    if (target === config.chains.mantle?.bridge) return "mantle";
    return undefined;
}

/**
 * Proposal details for direct simulation
 */
export interface ProposalDetails {
    targets: string[];
    values: bigint[];
    calldatas: string[];
    descriptionHash?: string;
}

/**
 * Parse propose() calldata to extract proposal details
 */
export function parseProposalCalldata(calldata: string): ProposalDetails {
    const iface = new Interface(governorABI);
    const parsed = iface.parseTransaction({ data: calldata });

    if (!parsed || parsed.name !== "propose") {
        throw new Error("Invalid calldata: expected propose() function call");
    }

    const [targets, values, calldatas, description] = parsed.args;

    return {
        targets: targets as string[],
        values: (values as bigint[]).map(v => BigInt(v)),
        calldatas: calldatas as string[],
        descriptionHash: description as string,
    };
}
