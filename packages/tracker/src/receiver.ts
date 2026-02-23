import { Contract, JsonRpcProvider } from "ethers";
import { receiverABI } from "./abis.js";
import { getRpcUrl } from "./config.js";
import type { CrossChainAction, CrossChainActionResult, CrossChainStatus } from "./types.js";
import { ReceiverState } from "./types.js";

/**
 * Map ReceiverState enum to our CrossChainStatus
 */
function receiverStateToStatus(state: number): CrossChainStatus {
  switch (state) {
    case ReceiverState.Queued:
      return "pending";
    case ReceiverState.Executed:
      return "executed";
    case ReceiverState.Expired:
      return "expired";
    default:
      return "not-transmitted";
  }
}

interface ProposalCreatedEvent {
  id: number;
  targets: string[];
  eta: number;
}

/**
 * Query ProposalCreated events from a receiver contract.
 * Tries fromBlock=0 first; falls back to smaller ranges if the RPC rejects.
 */
async function queryProposalCreatedEvents(
  receiver: Contract,
  provider: JsonRpcProvider,
): Promise<ProposalCreatedEvent[]> {
  const filter = receiver.filters.ProposalCreated!();

  // Progressive block range fallback
  const blockRanges = [
    { from: 0, to: "latest" },
    // If the full range fails, try last 500k blocks
  ];

  let logs;
  for (const range of blockRanges) {
    try {
      const toBlock = range.to === "latest" ? await provider.getBlockNumber() : range.to;
      logs = await receiver.queryFilter(filter, range.from, toBlock);
      break;
    } catch {
      // Try next range
      continue;
    }
  }

  if (!logs) {
    // Final fallback: try last 500k blocks
    try {
      const latest = await provider.getBlockNumber();
      const from = Math.max(0, latest - 500_000);
      logs = await receiver.queryFilter(filter, from, latest);
    } catch {
      return [];
    }
  }

  return logs.map((log) => {
    const parsed = receiver.interface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed) return null;
    return {
      id: Number(parsed.args[1]),
      targets: Array.from(parsed.args[2] as string[]),
      eta: Number(parsed.args[6]),
    };
  }).filter((e): e is ProposalCreatedEvent => e !== null);
}

/**
 * Check if two target arrays match (case-insensitive, same order)
 */
function targetsMatch(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every(
    (t, i) => t.toLowerCase() === actual[i]!.toLowerCase(),
  );
}

/**
 * Check L2 statuses for a batch of cross-chain actions.
 * Groups actions by chain for efficient querying, then runs all chains in parallel.
 */
export async function checkL2StatusBatch(
  actions: CrossChainAction[],
): Promise<CrossChainActionResult[]> {
  // Group actions by chain
  const byChain = new Map<string, CrossChainAction[]>();
  for (const action of actions) {
    const group = byChain.get(action.chainName) ?? [];
    group.push(action);
    byChain.set(action.chainName, group);
  }

  // Process each chain in parallel
  const chainResults = await Promise.allSettled(
    Array.from(byChain.entries()).map(async ([chainName, chainActions]) => {
      return processChain(chainName, chainActions);
    }),
  );

  // Flatten results, handling failures
  const results: CrossChainActionResult[] = [];
  let chainIdx = 0;
  for (const [, chainActions] of byChain.entries()) {
    const result = chainResults[chainIdx]!;
    if (result.status === "fulfilled") {
      results.push(...result.value);
    } else {
      // Chain query failed — mark all actions as not-transmitted with error
      for (const action of chainActions) {
        results.push({
          action,
          status: "not-transmitted",
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
    chainIdx++;
  }

  // Sort by original action index
  results.sort((a, b) => a.action.actionIndex - b.action.actionIndex);
  return results;
}

/**
 * Process all actions for a single chain
 */
async function processChain(
  chainName: string,
  actions: CrossChainAction[],
): Promise<CrossChainActionResult[]> {
  const rpcUrl = getRpcUrl(chainName);
  if (!rpcUrl) {
    return actions.map((action) => ({
      action,
      status: "not-transmitted" as CrossChainStatus,
      error: `No RPC URL configured for ${chainName}`,
    }));
  }

  // All actions on the same chain should use the same receiver
  const receiverAddr = actions[0]!.receiverAddress;
  if (!receiverAddr) {
    return actions.map((action) => ({
      action,
      status: "not-transmitted" as CrossChainStatus,
      error: `No receiver address configured for ${chainName}`,
    }));
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const receiver = new Contract(receiverAddr, receiverABI, provider);

  // Query ProposalCreated events once for this chain
  const events = await queryProposalCreatedEvents(receiver, provider);

  // Match each action against events
  const results: CrossChainActionResult[] = [];
  for (const action of actions) {
    const match = events.find((ev) => targetsMatch(action.innerTargets, ev.targets));

    if (!match) {
      results.push({ action, status: "not-transmitted" });
      continue;
    }

    // Found a matching proposal — check its state
    try {
      const state = Number(await receiver.state(match.id));
      results.push({
        action,
        status: receiverStateToStatus(state),
        l2ProposalId: match.id,
        eta: match.eta,
      });
    } catch (err) {
      results.push({
        action,
        status: "not-transmitted",
        l2ProposalId: match.id,
        eta: match.eta,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
