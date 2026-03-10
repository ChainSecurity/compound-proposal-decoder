/**
 * Types for the simulator API and UI components.
 */

// Serialized types - matching simulator package but defined locally
// for Next.js compatibility

export type SerializedTransactionExecution = {
  index: number;
  target: string;
  value: string;
  calldata: string;
  success: boolean;
  gasUsed?: string;
  txHash?: string;
  revertReason?: string;
};

export type SerializedChainExecutionResult = {
  chain: string;
  chainId: number;
  success: boolean;
  timelockAddress: string;
  executions: SerializedTransactionExecution[];
  totalGasUsed?: string;
  persisted: boolean;
  rpcUrl?: string;
};

export type SerializedSimulationResult = {
  proposalId?: string;
  success: boolean;
  mode: "governance" | "direct" | "direct-persist";
  chainResults: SerializedChainExecutionResult[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type SimulationMode = "governance" | "direct" | "direct-persist";

export type BackendType = "anvil" | "tenderly";

// Request types - mirror decoder request pattern
export type SimulateRequestById = {
  type: "id";
  proposalId: number;
  mode?: SimulationMode;
  backend?: BackendType;
  refreshTestnets?: boolean;
  deleteOldTestnets?: boolean;
};

export type SimulateRequestByCalldata = {
  type: "calldata";
  calldata: string;
  mode?: SimulationMode;
  backend?: BackendType;
  refreshTestnets?: boolean;
  deleteOldTestnets?: boolean;
};

export type SimulateRequestByDetails = {
  type: "details";
  details: {
    targets: string[];
    values: string[];
    calldatas: string[];
    descriptionHash?: string;
  };
  mode?: SimulationMode;
  backend?: BackendType;
  refreshTestnets?: boolean;
  deleteOldTestnets?: boolean;
};

export type SimulateRequest =
  | SimulateRequestById
  | SimulateRequestByCalldata
  | SimulateRequestByDetails;

export type SimulateResponse =
  | { success: true; data: SerializedSimulationResult }
  | { success: false; error: string };

