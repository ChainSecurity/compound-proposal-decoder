/**
 * Cross-Chain Proposal Execution Tracker
 *
 * Public API: given a proposal ID, checks whether each cross-chain action
 * has been received and executed on its target L2 chain.
 */

import { Contract, JsonRpcProvider } from "ethers";
import { governorABI } from "./abis.js";
import { detectBridgeAction } from "./bridges.js";
import { getMainnetConfig, getRpcUrl } from "./config.js";
import { checkL2StatusBatch } from "./receiver.js";
import { GovernorState } from "./types.js";
import type {
  BatchTrackingResult,
  CrossChainAction,
  CrossChainActionResult,
  TrackingResult,
} from "./types.js";

// Re-export public types
export type {
  BatchTrackingResult,
  CrossChainAction,
  CrossChainActionResult,
  TrackingResult,
} from "./types.js";
export {
  GovernorState,
  ReceiverState,
  type CrossChainStatus,
} from "./types.js";

/**
 * Query the execution tx hash for a proposal via the ProposalExecuted event.
 * Returns undefined if the event cannot be found.
 */
async function getExecutionTxHash(
  governor: Contract,
  provider: JsonRpcProvider,
  proposalId: number,
): Promise<string | undefined> {
  try {
    // ProposalExecuted(uint256 id) — id is NOT indexed, so we cannot filter by
    // value; fetch all events and find the matching one by parsing the log data.
    const filter = governor.filters.ProposalExecuted!();
    const latest = await provider.getBlockNumber();
    let logs;
    try {
      logs = await governor.queryFilter(filter, 0, latest);
    } catch {
      const from = Math.max(0, latest - 500_000);
      logs = await governor.queryFilter(filter, from, latest);
    }
    const match = logs.find((log) => {
      const parsed = governor.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed && Number(parsed.args[0]) === proposalId;
    });
    return match?.transactionHash;
  } catch {
    return undefined;
  }
}

/**
 * Internal: track a single proposal using the given provider and governor contract.
 */
async function trackSingle(
  proposalId: number,
  governor: Contract,
  provider: JsonRpcProvider,
): Promise<TrackingResult> {
  const start = Date.now();

  // Fetch governor state and proposal details in parallel
  const [stateResult, detailsResult] = await Promise.all([
    governor.state(proposalId) as Promise<bigint>,
    governor.proposalDetails(proposalId) as Promise<[string[], bigint[], string[], string]>,
  ]);

  const governorState = Number(stateResult) as GovernorState;
  // proposalDetails returns (address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)
  const [targets, , calldatas] = detailsResult;

  // Detect bridge calls among proposal actions
  const actions: CrossChainAction[] = [];
  for (let i = 0; i < targets.length; i++) {
    // Calldatas from OZ Governor already include the function selector
    const action = detectBridgeAction(i, targets[i]!, calldatas[i]!);
    if (action) actions.push(action);
  }

  const hasCrossChainActions = actions.length > 0;

  // If mainnet hasn't executed yet, all actions are "not-transmitted"
  if (governorState !== GovernorState.Executed || actions.length === 0) {
    const results: CrossChainActionResult[] = actions.map((action) => ({
      action,
      status: "not-transmitted",
    }));

    return {
      proposalId,
      governorState,
      hasCrossChainActions,
      actions: results,
      durationMs: Date.now() - start,
    };
  }

  // Proposal is executed on mainnet — get the execution tx hash to enable
  // precise bridge-message based matching on L2
  const executionTxHash = await getExecutionTxHash(governor, provider, proposalId);

  // Check L2 statuses, using the execution tx hash for bridge-message matching
  const results = await checkL2StatusBatch(actions, provider, executionTxHash);

  return {
    proposalId,
    governorState,
    hasCrossChainActions,
    actions: results,
    durationMs: Date.now() - start,
  };
}

/**
 * Create a shared mainnet provider and governor contract.
 */
function createGovernorContract(): { provider: JsonRpcProvider; governor: Contract } {
  const mainnet = getMainnetConfig();
  const rpcUrl = getRpcUrl("mainnet");
  if (!rpcUrl) throw new Error("No mainnet RPC URL configured");
  if (!mainnet.governorAddress) throw new Error("No governor address configured");

  const provider = new JsonRpcProvider(rpcUrl);
  const governor = new Contract(mainnet.governorAddress, governorABI, provider);
  return { provider, governor };
}

/**
 * Track the cross-chain execution status of a governance proposal.
 *
 * 1. Reads governor state and proposal details from mainnet
 * 2. Detects bridge calls among the proposal actions
 * 3. If the proposal has been executed on mainnet, looks up the execution tx
 *    to find the bridge message, then verifies the corresponding L2 proposal
 * 4. Returns status for each cross-chain action
 */
export async function trackProposal(proposalId: number): Promise<TrackingResult> {
  const { provider, governor } = createGovernorContract();
  return trackSingle(proposalId, governor, provider);
}

/**
 * Track multiple proposals sequentially, sharing a single mainnet provider.
 *
 * Proposals run sequentially to avoid hammering the RPC with parallel mainnet
 * calls (each proposal already parallelizes its L2 queries internally).
 */
export async function trackProposals(proposalIds: number[]): Promise<BatchTrackingResult> {
  const totalStart = Date.now();
  const { provider, governor } = createGovernorContract();

  const results: TrackingResult[] = [];
  for (const id of proposalIds) {
    const result = await trackSingle(id, governor, provider);
    results.push(result);
  }

  return {
    results,
    totalDurationMs: Date.now() - totalStart,
  };
}
