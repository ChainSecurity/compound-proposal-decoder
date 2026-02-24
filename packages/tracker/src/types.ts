/**
 * Cross-chain proposal execution statuses
 */
export type CrossChainStatus =
  | "not-transmitted"
  | "pending"
  | "executed"
  | "expired";

/**
 * Governor Bravo proposal states (on-chain enum)
 */
export enum GovernorState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

/**
 * BaseBridgeReceiver proposal states (on-chain enum)
 */
export enum ReceiverState {
  Queued = 0,
  Expired = 1,
  Executed = 2,
}

/**
 * A single cross-chain bridge call extracted from the proposal
 */
export interface CrossChainAction {
  actionIndex: number;
  bridgeType: string;
  chainName: string;
  chainId: number;
  /** L1 bridge contract address — used to find bridge events in the execution tx */
  bridgeAddress: string;
  receiverAddress: string;
  innerTargets: string[];
  /** Inner proposal values (decimal strings to avoid BigInt serialisation issues) */
  innerValues: string[];
  /** Inner proposal calldatas */
  innerCalldatas: string[];
}

/**
 * Result of checking a single cross-chain action's L2 status
 */
export interface CrossChainActionResult {
  action: CrossChainAction;
  status: CrossChainStatus;
  l2ProposalId?: number;
  eta?: number;
  creationTxHash?: string;
  executionTxHash?: string;
  error?: string;
}

/**
 * Top-level tracking result for a proposal
 */
export interface TrackingResult {
  proposalId: number;
  /** True when the proposal ID does not exist on-chain */
  notFound?: boolean;
  /** Error message for unexpected failures */
  error?: string;
  /** Undefined when notFound or error */
  governorState?: GovernorState;
  hasCrossChainActions: boolean;
  actions: CrossChainActionResult[];
  /** L1 execution transaction hash (only present when the proposal has been executed on mainnet) */
  l1ExecutionTxHash?: string;
  durationMs: number;
}

/**
 * Batch tracking result for multiple proposals
 */
export interface BatchTrackingResult {
  results: TrackingResult[];
  totalDurationMs: number;
}
