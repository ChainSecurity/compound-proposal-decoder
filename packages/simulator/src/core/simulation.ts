/**
 * Core simulation logic
 *
 * This module contains the shared simulation functions used by both
 * the CLI (main.ts) and library (simulator.ts) entry points.
 */

import { ethers, Interface } from "ethers";
import {
    governorABI,
    receiverABI,
    timelockABI,
    compoundABI,
} from "../abis";
import { loadConfig, getSimulatorRpcUrl } from "../config";
import { getRevertReason } from "../utils";
import type { Backend } from "../backends";
import type {
    Proposal,
    ChainExecutionResult,
    TransactionExecution,
} from "../types";
import type { SimulationContext, GovernanceSimulationResult } from "./types";
import { bridgeABIs, messageIndex } from "./constants";
import {
    getProposal,
    extractBridgedProposal,
    targetToL2Chain,
} from "./proposals";
import {
    createSnapshot,
    getRpcUrl,
    readSnapshotFile,
    writeSnapshotFile,
} from "./snapshots";

const config = loadConfig();

// ============ Setup Functions ============

/**
 * Setup delegation for robinhood address to gain voting power
 */
export async function setupDelegation(ctx: SimulationContext): Promise<void> {
    const { backend, logger } = ctx;
    const robinhood = config.defaults.robinhood;
    const compAddress = config.defaults.COMP;

    const provider = backend.getProvider("mainnet");
    const compContract = new ethers.Contract(compAddress, compoundABI, provider);
    const delegateTx = await compContract.delegate.populateTransaction(robinhood);

    logger.section("Setup");
    logger.step("Delegating COMP voting power");

    await backend.impersonateAccount("mainnet", robinhood);
    const delegateResult = await backend.sendTransaction("mainnet", {
        from: robinhood,
        to: compAddress,
        data: delegateTx.data!,
    });
    logger.tx("Delegate", delegateResult);

    // Mine a block to activate voting power (it's snapshot-based)
    await backend.mineBlock("mainnet");
    logger.done("Delegation complete");
}

// ============ Governance Mode Simulation ============

/**
 * Submit a proposal to the governor and return the new proposal ID
 *
 * This re-submits the proposal with a fresh snapshot so robinhood has voting power.
 */
async function submitProposal(
    proposal: Proposal,
    originalProposalId: string,
    chain: string,
    ctx: SimulationContext
): Promise<string> {
    const { backend, logger } = ctx;
    const chainConfig = config.chains[chain];
    const provider = backend.getProvider(chain);
    const robinhood = config.defaults.robinhood;

    const governor = new ethers.Contract(
        chainConfig.governorAddress!,
        governorABI,
        provider,
    );

    // Get the next proposal ID before submitting
    const nextProposalId = await governor.getNextProposalId();

    // Create the propose transaction (copy arrays to avoid read-only issues)
    // Add timestamp to description to avoid duplicate proposal rejection on resubmission
    const proposeTx = await governor.propose.populateTransaction(
        [...proposal.targets],
        [...proposal.values],
        [...proposal.calldatas],
        `Simulation of proposal ${originalProposalId} at ${Date.now()}`
    );

    await backend.sendTransaction(chain, {
        from: robinhood,
        to: chainConfig.governorAddress!,
        gas: config.defaults.gas,
        gasPrice: config.defaults.gasPrice,
        data: proposeTx.data!,
    });

    // Mine a block to finalize the proposal
    await backend.mineBlock(chain);

    const newProposalId = nextProposalId.toString();
    logger.info("New proposal ID", newProposalId);
    return newProposalId;
}

/**
 * Advance to voting start and cast a vote
 */
async function advanceAndVote(
    proposalId: string,
    chain: string,
    ctx: SimulationContext
): Promise<void> {
    const { backend, logger } = ctx;
    const chainConfig = config.chains[chain];
    const provider = backend.getProvider(chain);
    const robinhood = config.defaults.robinhood;

    const governor = new ethers.Contract(
        chainConfig.governorAddress!,
        governorABI,
        provider,
    );

    // Advance to vote start block
    const currentBlockNumber = await provider.getBlockNumber();
    const voteStartBlock = Number(await governor.proposalSnapshot(proposalId)) + 1;

    if (voteStartBlock > currentBlockNumber) {
        logger.step(`Advancing to block ${voteStartBlock.toLocaleString()}`);
        await backend.mineBlock(chain, { blockNumber: voteStartBlock });
    }

    // Check voting power for the proposal
    const snapshotBlock = await governor.proposalSnapshot(proposalId);
    const votingPower = await governor.getVotes(robinhood, snapshotBlock);
    logger.info("Voting power at snapshot", votingPower.toString());

    // Cast vote
    logger.step("Casting vote");
    const voteTx = await governor.castVote.populateTransaction(proposalId, 1);
    await backend.sendTransaction(chain, {
        from: robinhood,
        to: chainConfig.governorAddress!,
        data: voteTx.data!,
    });
}

/**
 * Advance to end of voting period and queue the proposal
 */
async function advanceAndQueue(
    proposalId: string,
    chain: string,
    ctx: SimulationContext
): Promise<void> {
    const { backend, logger } = ctx;
    const chainConfig = config.chains[chain];
    const provider = backend.getProvider(chain);
    const robinhood = config.defaults.robinhood;

    const governor = new ethers.Contract(
        chainConfig.governorAddress!,
        governorABI,
        provider,
    );

    // Advance to end of voting period
    const votingPeriod = await governor.votingPeriod();
    const startingBlock = await governor.proposalSnapshot(proposalId);
    const proposalEndBlock = Number(startingBlock + votingPeriod);

    const currentBlockNumber = await provider.getBlockNumber();

    // Need to be PAST the deadline to queue (block > proposalEndBlock)
    const targetBlock = proposalEndBlock + 1;
    if (currentBlockNumber <= proposalEndBlock) {
        logger.step(`Advancing to block ${targetBlock.toLocaleString()}`);
        await backend.mineBlock(chain, { blockNumber: targetBlock });
    }

    // Queue proposal
    logger.step("Queueing proposal");
    const queueTx = await governor.queue.populateTransaction(proposalId);
    await backend.sendTransaction(chain, {
        from: robinhood,
        to: chainConfig.governorAddress!,
        data: queueTx.data!,
    });
}

/**
 * Advance past grace period and execute the proposal
 */
async function advanceAndExecute(
    proposalId: string,
    chain: string,
    ctx: SimulationContext
): Promise<ChainExecutionResult> {
    const { backend, logger } = ctx;
    const chainConfig = config.chains[chain];
    const provider = backend.getProvider(chain);
    const robinhood = config.defaults.robinhood;

    const governor = new ethers.Contract(
        chainConfig.governorAddress!,
        governorABI,
        provider,
    );

    const timelock = new ethers.Contract(
        chainConfig.timelockAddress,
        timelockABI,
        provider,
    );

    // Advance time for execution
    const gracePeriod = Number(await timelock.GRACE_PERIOD());
    logger.step(`Advancing time by ${gracePeriod.toLocaleString()} seconds`);
    const currentBlock = await provider.getBlock("latest");
    const currentTimestamp = currentBlock!.timestamp;
    const executionTimestamp = currentTimestamp + gracePeriod;

    await backend.mineBlock(chain, { timestamp: executionTimestamp });
    await backend.mineBlock(chain);

    // Apply proposal-specific patches
    if (proposalId == "524") {
        const { applyPatch524 } = await import("../patches/patch-524");
        await applyPatch524(backend, chain);
    }

    // Execute proposal
    logger.step("Executing proposal");
    const executeTx = await governor.execute.populateTransaction(proposalId);
    const executeResult = await backend.sendTransaction(chain, {
        from: robinhood,
        to: chainConfig.governorAddress!,
        data: executeTx.data!,
    });
    logger.done("Execution complete");
    logger.tx("Execute proposal", executeResult);

    const receipt = await provider.waitForTransaction(executeResult);
    const success = receipt?.status === 1;
    const gasUsed = receipt?.gasUsed;

    // Extract revert reason if transaction failed
    let revertReason: string | undefined;
    if (!success && executeResult) {
        revertReason = await getRevertReason(provider, executeResult);
    }

    return {
        chain,
        chainId: chainConfig.chainId,
        success,
        timelockAddress: chainConfig.timelockAddress,
        executions: [{
            index: 0,
            target: chainConfig.governorAddress!,
            value: 0n,
            calldata: executeTx.data!,
            success,
            gasUsed,
            txHash: executeResult,
            revertReason,
        }],
        totalGasUsed: gasUsed,
        persisted: true,
        rpcUrl: getSimulatorRpcUrl(chain),
    };
}

/**
 * Run the full governance flow for a proposal
 *
 * This is the core simulation logic that:
 * 1. Submits a copy of the proposal (to get fresh voting snapshot)
 * 2. Advances to voting start and casts vote
 * 3. Advances to voting end and queues
 * 4. Advances past grace period and executes
 */
export async function runGovernanceFlow(
    proposal: Proposal,
    originalProposalId: string,
    chain: string,
    ctx: SimulationContext
): Promise<ChainExecutionResult> {
    const { backend, logger } = ctx;

    logger.section(chain);

    const robinhood = config.defaults.robinhood;
    await backend.impersonateAccount(chain, robinhood);

    // Always submit a fresh copy of the proposal for clean voting snapshot
    logger.step("Submitting proposal for fresh snapshot");
    const proposalId = await submitProposal(proposal, originalProposalId, chain, ctx);

    // Run the governance flow
    await advanceAndVote(proposalId, chain, ctx);
    await advanceAndQueue(proposalId, chain, ctx);
    return await advanceAndExecute(proposalId, chain, ctx);
}

/**
 * Simulate a proposal through the full governance flow
 *
 * This is a compatibility wrapper that checks if the proposal needs re-submission.
 * New code should prefer using runGovernanceFlow() directly.
 */
export async function simulateGovernance(
    proposalId: string,
    chain: string,
    ctx: SimulationContext,
    proposal?: Proposal
): Promise<GovernanceSimulationResult> {
    const { backend, logger } = ctx;

    logger.section(chain);
    const provider = backend.getProvider(chain);
    const chainConfig = config.chains[chain];

    const governor = new ethers.Contract(
        chainConfig.governorAddress!,
        governorABI,
        provider,
    );

    const robinhood = config.defaults.robinhood;
    await backend.impersonateAccount(chain, robinhood);

    // Check voting power at the proposal's snapshot block
    let actualProposalId = proposalId;
    const snapshotBlock = await governor.proposalSnapshot(proposalId);

    // snapshotBlock === 0 means the proposal doesn't exist (default mapping value)
    // In this case, we need to re-submit the proposal regardless of voting power
    const proposalExists = snapshotBlock > 0n;
    const votingPower = proposalExists ? await governor.getVotes(robinhood, snapshotBlock) : 0n;

    // Re-propose if:
    // 1. The proposal doesn't exist on this fork (snapshotBlock === 0)
    // 2. Or robinhood has no voting power at the original snapshot
    if ((!proposalExists || votingPower === 0n) && proposal) {
        if (!proposalExists) {
            logger.warn(`Proposal ${proposalId} does not exist on this fork`);
        } else {
            logger.warn("Robinhood has no voting power at original proposal snapshot");
        }
        logger.step("Re-submitting proposal to create fresh snapshot after delegation");

        actualProposalId = await submitProposal(proposal, proposalId, chain, ctx);
    }

    // Run the governance flow steps
    await advanceAndVote(actualProposalId, chain, ctx);
    await advanceAndQueue(actualProposalId, chain, ctx);
    const result = await advanceAndExecute(actualProposalId, chain, ctx);

    return {
        result,
        actualProposalId,
    };
}

// ============ L2 Bridging Simulation ============

/**
 * Simulate all L2 bridging calls in a proposal
 *
 * Uses the provided proposal object directly rather than querying the governor,
 * which avoids issues when:
 * - The proposal was re-submitted (different ID)
 * - The fork block is before the proposal was created
 * - The proposal state changed after execution
 */
export async function simulateBridging(
    proposal: Proposal,
    ctx: SimulationContext
): Promise<ChainExecutionResult[]> {
    const results: ChainExecutionResult[] = [];

    for (let i = 0; i < proposal.targets.length; i++) {
        const l2 = targetToL2Chain(proposal.targets[i]!);
        if (!l2) continue;

        const result = await simulateL2(l2, proposal.calldatas[i]!, ctx);
        results.push(result);
    }

    return results;
}

/**
 * Simulate execution on an L2 chain after bridging
 */
export async function simulateL2(
    chain: string,
    calldata: string,
    ctx: SimulationContext
): Promise<ChainExecutionResult> {
    const { backend, logger } = ctx;

    logger.section(chain);

    // Create snapshot for L2 chain before execution (only if backend supports persistent snapshots)
    if (backend.supportsPersistentSnapshots()) {
        await createSnapshot(chain, backend, logger);
    }

    const provider = backend.getProvider(chain);
    const chainConfig = config.chains[chain];
    const receiver = new ethers.Contract(
        chainConfig.receiver!,
        receiverABI,
        provider,
    );

    const timelockAddress = await receiver.localTimelock();
    const timelock = new ethers.Contract(timelockAddress, timelockABI, provider);
    const alias = chainConfig.l2msgsender!;

    // Set cross-chain message sender for OP-stack chains
    if (["base", "optimism", "mantle"].includes(chain)) {
        logger.step("Setting cross-chain message sender");
        await backend.setStorageAt(
            chain,
            alias,
            "0x00000000000000000000000000000000000000000000000000000000000000cc",
            "0x0000000000000000000000006d903f6003cca6255D85CcA4D3B5E5146dC33925"
        );
    }

    const iface = new Interface(bridgeABIs[chain] as ethers.InterfaceAbi);
    const bridgeCall = iface.parseTransaction({ data: calldata });
    const message = bridgeCall!.args[messageIndex[chain]!];

    // Impersonate and send the bridged message
    await backend.impersonateAccount(chain, alias);
    await backend.sendTransaction(chain, {
        from: alias,
        to: chainConfig.receiver!,
        data: message,
    });

    const gracePeriod = Number(await timelock.GRACE_PERIOD());
    logger.step(`Advancing time by ${gracePeriod.toLocaleString()} seconds`);
    const currentBlock = await provider.getBlock("latest");
    const currentTimestamp = currentBlock!.timestamp;
    const executionTimestamp = currentTimestamp + gracePeriod;

    await backend.mineBlock(chain, { timestamp: executionTimestamp });

    const proposalIdOnChain = await receiver.proposalCount();
    await backend.mineBlock(chain);

    logger.step("Executing proposal");
    const executeTx = await receiver.executeProposal.populateTransaction(proposalIdOnChain);
    const executeResult = await backend.sendTransaction(chain, {
        from: alias,
        to: chainConfig.receiver!,
        data: executeTx.data!,
    });
    logger.done("Execution complete");
    logger.tx("Execute proposal", executeResult);

    const receipt = await provider.waitForTransaction(executeResult);
    const success = receipt?.status === 1;
    const gasUsed = receipt?.gasUsed;

    // Extract revert reason if transaction failed
    let revertReason: string | undefined;
    if (!success && executeResult) {
        revertReason = await getRevertReason(provider, executeResult);
    }

    return {
        chain,
        chainId: chainConfig.chainId,
        success,
        timelockAddress: timelockAddress as string,
        executions: [{
            index: 0,
            target: chainConfig.receiver!,
            value: 0n,
            calldata: executeTx.data!,
            success,
            gasUsed,
            txHash: executeResult,
            revertReason,
        }],
        totalGasUsed: gasUsed,
        persisted: true,
        rpcUrl: getSimulatorRpcUrl(chain),
    };
}

// ============ Direct Mode Simulation ============

/**
 * Execute a proposal directly from the timelock (skip governance)
 */
export async function runDirect(
    proposal: Proposal,
    chain: string,
    persist: boolean,
    ctx: SimulationContext
): Promise<ChainExecutionResult> {
    const { backend, logger } = ctx;
    const provider = backend.getProvider(chain);

    const chainConfig = config.chains[chain];
    const fromAddress = chainConfig.timelockAddress;

    if (!fromAddress) {
        throw new Error(`Missing timelock address for chain ${chain}.`);
    }

    const executions: TransactionExecution[] = [];
    let totalGasUsed = 0n;

    const params = proposal.targets.map((target, i) => ({
        from: fromAddress,
        to: target,
        gas: config.defaults.gas,
        gasPrice: config.defaults.gasPrice,
        value: "0x" + proposal.values[i]!.toString(16),
        data: proposal.calldatas[i],
    }));

    // Impersonate the timelock
    await backend.impersonateAccount(chain, fromAddress);

    if (persist) {
        // Create snapshot for L2 chains (only if backend supports persistent snapshots)
        if (chain !== "mainnet" && backend.supportsPersistentSnapshots()) {
            const snapshot = await backend.snapshot(chain);
            const rpcUrl = getRpcUrl(chain);
            const data = readSnapshotFile(chain);
            if (!data[rpcUrl]) {
                data[rpcUrl] = [];
            }
            data[rpcUrl]!.push(snapshot);
            writeSnapshotFile(chain, data);
            logger.info(`Snapshot ${chain}`, snapshot);
        }

        for (let i = 0; i < params.length; i++) {
            const param = params[i]!;
            logger.step(`Executing transaction ${i + 1}/${params.length}`);
            const txHash = await backend.sendTransaction(chain, param);
            const receipt = await provider.waitForTransaction(txHash);
            const success = receipt!.status === 1;
            const gasUsed = receipt!.gasUsed;

            // Extract revert reason if transaction failed
            let revertReason: string | undefined;
            if (!success && txHash) {
                revertReason = await getRevertReason(provider, txHash);
                logger.error(`Transaction ${i + 1} failed: ${revertReason ?? "unknown reason"}`);
            } else if (success) {
                logger.done(`Transaction ${i + 1} complete`);
            }
            logger.tx(`Transaction ${i + 1}`, txHash);
            logger.info("Gas used", gasUsed);

            executions.push({
                index: i,
                target: proposal.targets[i]!,
                value: proposal.values[i]!,
                calldata: proposal.calldatas[i]!,
                success,
                gasUsed,
                txHash,
                revertReason,
            });

            totalGasUsed += gasUsed;
        }
    } else {
        // Use bundle simulation for non-persistent mode
        logger.step(`Simulating ${params.length} transactions`);
        const bundleResults = await backend.simulateBundle(chain, params);
        const successCount = bundleResults.filter(entry => entry.success).length;
        logger.done(`Simulation complete: ${successCount}/${bundleResults.length} succeeded`);

        for (let i = 0; i < bundleResults.length; i++) {
            const result = bundleResults[i]!;

            executions.push({
                index: i,
                target: proposal.targets[i]!,
                value: proposal.values[i]!,
                calldata: proposal.calldatas[i]!,
                success: result.success,
                gasUsed: result.gasUsed,
                txHash: result.txHash,
                revertReason: result.revertReason,
            });

            if (result.gasUsed) {
                totalGasUsed += result.gasUsed;
            }
        }
    }

    return {
        chain,
        chainId: chainConfig.chainId,
        success: executions.every(e => e.success),
        timelockAddress: fromAddress,
        executions,
        totalGasUsed: totalGasUsed > 0n ? totalGasUsed : undefined,
        persisted: persist,
        rpcUrl: getSimulatorRpcUrl(chain),
    };
}

/**
 * Execute a proposal directly with L2 bridging
 */
export async function runDirectWithL2(
    proposal: Proposal,
    chain: string,
    persist: boolean,
    ctx: SimulationContext
): Promise<ChainExecutionResult[]> {
    const results: ChainExecutionResult[] = [];
    const mainnetResult = await runDirect(proposal, chain, persist, ctx);
    results.push(mainnetResult);

    if (chain !== "mainnet") {
        return results;
    }

    // Process L2 bridges
    for (let i = 0; i < proposal.targets.length; i++) {
        const l2 = targetToL2Chain(proposal.targets[i]!);
        if (!l2) continue;

        const bridgedProposal = extractBridgedProposal(proposal.calldatas[i]!, l2);
        const l2Result = await runDirect(bridgedProposal, l2, persist, ctx);
        results.push(l2Result);
    }

    return results;
}

// ============ Proposal Submission ============

/**
 * Submit a proposal from calldata and return the created proposal ID
 */
export async function submitProposalFromCalldata(
    calldata: string,
    ctx: SimulationContext
): Promise<{ proposalId: string; proposal: Proposal }> {
    const { backend, logger } = ctx;
    const provider = backend.getProvider("mainnet");
    const robinhood = config.defaults.robinhood;

    const governor = new ethers.Contract(
        config.chains.mainnet.governorAddress!,
        governorABI,
        provider,
    );

    const nextProposalId = await governor.getNextProposalId();
    logger.step("Creating proposal from calldata");

    const proposeTxHash = await backend.sendTransaction("mainnet", {
        from: robinhood,
        to: config.chains.mainnet.governorAddress!,
        gas: config.defaults.gas,
        gasPrice: config.defaults.gasPrice,
        value: "0x0",
        data: calldata,
    });
    logger.tx("Propose", proposeTxHash);

    // Wait for the transaction and check if it succeeded
    const proposeReceipt = await provider.waitForTransaction(proposeTxHash);
    if (proposeReceipt?.status === 0) {
        logger.error("Propose transaction reverted");
        // Try to get revert reason
        try {
            await provider.call({
                from: robinhood,
                to: config.chains.mainnet.governorAddress,
                data: calldata,
            });
        } catch (err) {
            logger.error(`Revert reason: ${err}`);
        }
        throw new Error("Propose transaction reverted");
    }

    const proposalId = nextProposalId.toString();
    logger.done(`Proposal ${proposalId} created`);

    const proposal = await getProposal(proposalId, provider);
    return { proposalId, proposal };
}
