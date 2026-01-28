/**
 * Pretty printing utilities for simulation results
 */

import type { SimulationResult, ChainExecutionResult, TransactionExecution } from "./types";

const DIVIDER = "=".repeat(80);
const THIN_DIVIDER = "-".repeat(37);

function formatAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function formatGas(gas: bigint | undefined): string {
  if (gas === undefined) return "N/A";
  return gas.toLocaleString();
}

function formatTxHash(hash: string | undefined): string {
  if (!hash) return "N/A";
  return `${hash.slice(0, 10)}...`;
}

function formatStatus(success: boolean): string {
  return success ? "[OK]" : "[X] ";
}

function printTransactionExecution(tx: TransactionExecution): void {
  const status = formatStatus(tx.success);
  const target = formatAddress(tx.target);
  const gas = formatGas(tx.gasUsed);
  const txHash = formatTxHash(tx.txHash);

  console.log(`    ${status} [${tx.index}] ${target}`);
  console.log(`         Gas: ${gas} | Tx: ${txHash}`);

  if (tx.revertReason) {
    console.log(`         Revert: ${tx.revertReason}`);
  }
  console.log();
}

function printChainResult(result: ChainExecutionResult): void {
  const chainName = result.chain.toUpperCase();
  const status = result.success ? "SUCCESS" : "FAILED";
  const totalGas = formatGas(result.totalGasUsed);

  console.log(`  ${chainName}`);
  console.log(`  ${THIN_DIVIDER}`);
  console.log(`  Status: ${status} | Gas: ${totalGas}`);
  console.log();

  for (const tx of result.executions) {
    printTransactionExecution(tx);
  }
}

export function prettyPrint(result: SimulationResult): void {
  const status = result.success ? "SUCCESS" : "FAILED";

  console.log();
  console.log(DIVIDER);
  console.log("  SIMULATION RESULT");
  console.log(DIVIDER);
  console.log(`  Status:     ${status}`);
  console.log(`  Mode:       ${result.mode}`);
  if (result.proposalId) {
    console.log(`  Proposal:   ${result.proposalId}`);
  }
  console.log(`  Duration:   ${result.durationMs}ms`);
  console.log();

  for (const chainResult of result.chainResults) {
    printChainResult(chainResult);
  }

  console.log(DIVIDER);
  console.log();
}

export function printCompact(result: SimulationResult): void {
  const status = result.success ? "SUCCESS" : "FAILED";
  const chains = result.chainResults.map((r) => r.chain).join(", ");
  console.log(`[${status}] Proposal ${result.proposalId ?? "N/A"} | Mode: ${result.mode} | Chains: ${chains} | Duration: ${result.durationMs}ms`);
}
