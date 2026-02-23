import chalk from "chalk";
import type { BatchTrackingResult, TrackingResult, CrossChainActionResult } from "./types.js";
import { GovernorState } from "./types.js";
import { getTxExplorerUrl } from "./explorer.js";

const STATUS_DISPLAY: Record<string, { icon: string; color: (s: string) => string }> = {
  executed: { icon: "●", color: chalk.green },
  pending: { icon: "◐", color: chalk.blue },
  "not-transmitted": { icon: "○", color: chalk.yellow },
  expired: { icon: "✗", color: chalk.red },
};

const GOVERNOR_STATE_NAMES: Record<number, string> = {
  [GovernorState.Pending]: "Pending",
  [GovernorState.Active]: "Active",
  [GovernorState.Canceled]: "Canceled",
  [GovernorState.Defeated]: "Defeated",
  [GovernorState.Succeeded]: "Succeeded",
  [GovernorState.Queued]: "Queued",
  [GovernorState.Expired]: "Expired",
  [GovernorState.Executed]: "Executed",
};

export function prettyPrint(result: TrackingResult): void {
  const govStateName = GOVERNOR_STATE_NAMES[result.governorState] ?? "Unknown";

  console.log();
  console.log(chalk.bold(`Proposal ${result.proposalId}`) + `  —  Governor: ${govStateName}`);
  console.log();

  if (!result.hasCrossChainActions) {
    console.log(chalk.dim("  No cross-chain actions detected."));
    console.log();
    console.log(chalk.dim(`  Completed in ${result.durationMs}ms`));
    return;
  }

  // Group actions by chain
  const byChain = new Map<string, CrossChainActionResult[]>();
  for (const action of result.actions) {
    const chain = action.action.chainName;
    const group = byChain.get(chain) ?? [];
    group.push(action);
    byChain.set(chain, group);
  }

  for (const [chainName, actions] of byChain) {
    const chainId = actions[0]!.action.chainId;
    console.log(chalk.bold(`  ${chainName}`) + chalk.dim(` (chain ${chainId})`));

    for (const result of actions) {
      const display = STATUS_DISPLAY[result.status] ?? STATUS_DISPLAY["not-transmitted"]!;
      const statusText = display.color(`${display.icon} ${result.status}`);
      const actionLabel = chalk.dim(`action[${result.action.actionIndex}]`);

      let extra = "";
      if (result.l2ProposalId !== undefined) {
        extra += chalk.dim(` — L2 proposal #${result.l2ProposalId}`);
      }
      if (result.eta !== undefined) {
        const date = new Date(result.eta * 1000);
        extra += chalk.dim(` — ETA ${date.toISOString()}`);
      }
      if (result.error) {
        extra += chalk.red(` — ${result.error}`);
      }

      console.log(`    ${statusText}  ${actionLabel}${extra}`);

      // Show explorer links for tx hashes
      if (result.creationTxHash) {
        const url = getTxExplorerUrl(result.action.chainId, result.creationTxHash);
        if (url) {
          console.log(chalk.dim(`      Created:  ${url}`));
        }
      }
      if (result.executionTxHash) {
        const url = getTxExplorerUrl(result.action.chainId, result.executionTxHash);
        if (url) {
          console.log(chalk.dim(`      Executed: ${url}`));
        }
      }
    }
    console.log();
  }

  // Summary counts
  const counts: Record<string, number> = {};
  for (const action of result.actions) {
    counts[action.status] = (counts[action.status] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([status, count]) => {
    const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY["not-transmitted"]!;
    return display.color(`${count} ${status}`);
  });
  console.log(`  ${parts.join("  ")}`);
  console.log(chalk.dim(`  Completed in ${result.durationMs}ms`));
}

export function prettyPrintBatch(batch: BatchTrackingResult): void {
  for (const result of batch.results) {
    prettyPrint(result);
  }

  // Batch summary when 2+ proposals
  if (batch.results.length >= 2) {
    const totalActions = batch.results.reduce(
      (sum, r) => sum + r.actions.length,
      0,
    );

    const counts: Record<string, number> = {};
    for (const result of batch.results) {
      for (const action of result.actions) {
        counts[action.status] = (counts[action.status] ?? 0) + 1;
      }
    }

    console.log();
    console.log(chalk.bold("── Batch Summary ──"));
    console.log(`  ${batch.results.length} proposals, ${totalActions} cross-chain actions`);

    if (totalActions > 0) {
      const parts = Object.entries(counts).map(([status, count]) => {
        const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY["not-transmitted"]!;
        return display.color(`${count} ${status}`);
      });
      console.log(`  ${parts.join("  ")}`);
    }

    console.log(chalk.dim(`  Total time: ${batch.totalDurationMs}ms`));
  }
}
