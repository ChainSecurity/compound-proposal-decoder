/**
 * Serialization utilities for converting between native types and JSON-safe types
 */

import type {
  TransactionExecution,
  ChainExecutionResult,
  SimulationResult,
  SerializedTransactionExecution,
  SerializedChainExecutionResult,
  SerializedSimulationResult,
} from "./types";

export function serializeTransactionExecution(
  tx: TransactionExecution
): SerializedTransactionExecution {
  return {
    index: tx.index,
    target: tx.target,
    value: tx.value.toString(),
    calldata: tx.calldata,
    success: tx.success,
    gasUsed: tx.gasUsed?.toString(),
    txHash: tx.txHash,
    revertReason: tx.revertReason,
  };
}

export function serializeChainExecutionResult(
  result: ChainExecutionResult
): SerializedChainExecutionResult {
  return {
    chain: result.chain,
    chainId: result.chainId,
    success: result.success,
    timelockAddress: result.timelockAddress,
    executions: result.executions.map(serializeTransactionExecution),
    totalGasUsed: result.totalGasUsed?.toString(),
    persisted: result.persisted,
    rpcUrl: result.rpcUrl,
  };
}

export function serializeSimulationResult(
  result: SimulationResult
): SerializedSimulationResult {
  return {
    proposalId: result.proposalId,
    success: result.success,
    mode: result.mode,
    chainResults: result.chainResults.map(serializeChainExecutionResult),
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  };
}

export function deserializeTransactionExecution(
  tx: SerializedTransactionExecution
): TransactionExecution {
  return {
    index: tx.index,
    target: tx.target,
    value: BigInt(tx.value),
    calldata: tx.calldata,
    success: tx.success,
    gasUsed: tx.gasUsed ? BigInt(tx.gasUsed) : undefined,
    txHash: tx.txHash,
    revertReason: tx.revertReason,
  };
}

export function deserializeChainExecutionResult(
  result: SerializedChainExecutionResult
): ChainExecutionResult {
  return {
    chain: result.chain,
    chainId: result.chainId,
    success: result.success,
    timelockAddress: result.timelockAddress,
    executions: result.executions.map(deserializeTransactionExecution),
    totalGasUsed: result.totalGasUsed ? BigInt(result.totalGasUsed) : undefined,
    persisted: result.persisted,
    rpcUrl: result.rpcUrl,
  };
}

export function deserializeSimulationResult(
  result: SerializedSimulationResult
): SimulationResult {
  return {
    proposalId: result.proposalId,
    success: result.success,
    mode: result.mode,
    chainResults: result.chainResults.map(deserializeChainExecutionResult),
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  };
}
