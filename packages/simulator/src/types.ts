/**
 * Type definitions for simulation results
 */

export type BackendType = "anvil" | "tenderly";

export type TransactionExecution = {
  index: number;
  target: string;
  value: bigint;
  calldata: string;
  success: boolean;
  gasUsed?: bigint;
  txHash?: string;
  revertReason?: string;
};

export type ChainExecutionResult = {
  chain: string;
  chainId: number;
  success: boolean;
  timelockAddress: string;
  executions: TransactionExecution[];
  totalGasUsed?: bigint;
  persisted: boolean;
  rpcUrl?: string;
};

export type SimulationResult = {
  proposalId?: string;
  success: boolean;
  mode: "governance" | "direct" | "direct-persist";
  backend?: BackendType;
  chainResults: ChainExecutionResult[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

// Serialized versions (bigint -> string) for JSON compatibility

export type SerializedTransactionExecution = Omit<TransactionExecution, "value" | "gasUsed"> & {
  value: string;
  gasUsed?: string;
};

export type SerializedChainExecutionResult = Omit<ChainExecutionResult, "executions" | "totalGasUsed"> & {
  executions: SerializedTransactionExecution[];
  totalGasUsed?: string;
  rpcUrl?: string;
};

export type SerializedSimulationResult = Omit<SimulationResult, "chainResults"> & {
  chainResults: SerializedChainExecutionResult[];
  backend?: BackendType;
};

// Chain configuration types
export type ChainConfig = {
  rpcUrl: string;
  chainId: number;
  governorAddress?: string;
  timelockAddress: string;
  receiver?: string;
  bridge?: string;
  l2msgsender?: string;
};

export type Config = {
  chains: Record<string, ChainConfig>;
  defaults: {
    robinhood: string;
    COMP: string;
    gas: string;
    gasPrice: string;
  };
};

// Proposal types
export type Proposal = {
  targets: string[];
  values: bigint[];
  calldatas: string[];
};

// Revert types
export type RevertResult = {
  chain: string;
  success: boolean;
  snapshotId?: string;
  error?: string;
};
