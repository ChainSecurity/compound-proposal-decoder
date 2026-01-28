/**
 * Serialized types for the decoder output.
 * These mirror the decoder package types but with BigInt converted to strings
 * for JSON serialization.
 */

import type { DataSource, Sourced } from "./sources";

// Re-export source types for convenience
export type { DataSource, Sourced } from "./sources";
export { isSourced, unwrap, getSource } from "./sources";

/** Serializable parameter info that captures essential ParamType data */
export type SerializableParamInfo = {
  name: string;
  type: string;         // Full type string e.g. "address", "uint256", "tuple(address,uint256)[]"
  baseType: string;     // Base type: "address", "uint", "tuple", "array", etc.
  components?: SerializableParamInfo[];  // For tuples
  arrayChildren?: SerializableParamInfo; // For arrays
};

export type AddressMetadata = {
  contractName?: string | null;
  etherscanLabel?: string | null;
  tokenSymbol?: string | null;
  labels?: string[];
  ensName?: string | null;
  url?: string | null;
  description?: string | null;
  notes?: string[];
  implementation?: {
    address: string;
    contractName?: string | null;
    etherscanLabel?: string | null;
    tokenSymbol?: string | null;
    labels?: string[];
    ensName?: string | null;
  };
};

export type AddressMetadataMap = Record<string, AddressMetadata>;

export type CallInsightEntry = {
  label: MaybeSourced<string>;
  value: MaybeSourced<string>;
  /** Optional metadata for the entry (e.g., resolved address info) */
  metadata?: {
    /** If value is an address, the resolved name */
    resolvedName?: MaybeSourced<string>;
    /** If value is an address, the chain for explorer links */
    chainId?: number;
    /** Type hint for rendering */
    type?: "address" | "number" | "percent" | "text";
  };
};

export type CallInsight = {
  title: string;
  entries: CallInsightEntry[];
  _handlerSource?: DataSource;
};

/** Helper type for values that may be sourced */
export type MaybeSourced<T> = T | Sourced<T>;

export type SerializedDecodedFunction = {
  name: MaybeSourced<string>;
  signature: MaybeSourced<string>;
  selector: MaybeSourced<string>;
  args: unknown[];
  argSources?: DataSource[]; // Source for each arg (calldata offset/length)
  argTypes: string[];
  argParamInfo?: SerializableParamInfo[]; // Serializable param metadata for proper rendering
  // Note: argParams and rawArgs are excluded as they contain non-serializable ParamType objects
  addressMetadata?: AddressMetadataMap | SourcedAddressMetadataMap;
};

export type CallEdge = {
  type: MaybeSourced<"bridge" | "multicall" | "delegatecall" | "call" | "staticcall" | "other">;
  chainId?: MaybeSourced<number>;
  label?: MaybeSourced<string>;
  meta?: Record<string, unknown>;
  _source?: DataSource;
};

export type SerializedCallNode = {
  chainId: MaybeSourced<number>;
  target: MaybeSourced<string>;
  targetContractName?: MaybeSourced<string>;
  implementation?: MaybeSourced<string>;
  implementationContractName?: MaybeSourced<string>;
  valueWei: MaybeSourced<string>; // BigInt serialized as string
  rawCalldata: MaybeSourced<string>;
  decoded?: SerializedDecodedFunction;
  notes?: string[];
  insights?: CallInsight[];
  children?: Array<{
    edge: CallEdge;
    node: SerializedCallNode;
  }>;
};

export type SerializedDecodedProposal = {
  governor: MaybeSourced<string>;
  proposalId: MaybeSourced<string>; // BigInt serialized as string
  descriptionHash: MaybeSourced<string>;
  calls: SerializedCallNode[];
  /** Whether source tracking was enabled */
  sourcesTracked?: boolean;
};

export type DecodeRequestById = {
  type: "id";
  proposalId: number;
};

export type DecodeRequestByCalldata = {
  type: "calldata";
  calldata: string;
};

export type DecodeRequestByDetails = {
  type: "details";
  details: {
    targets: string[];
    values: string[];
    calldatas: string[];
    descriptionHash: string;
  };
  metadata?: {
    governor?: string;
    proposalId?: string;
    chainId?: number;
  };
};

export type DecodeRequest =
  | DecodeRequestById
  | DecodeRequestByCalldata
  | DecodeRequestByDetails;

export type DecodeResponse =
  | { success: true; data: SerializedDecodedProposal }
  | { success: false; error: string };

// =============================================================================
// Sourced address metadata (for detailed address info with sources)
// =============================================================================

/** Address metadata with optional source tracking for each field */
export type SourcedAddressMetadata = {
  contractName?: Sourced<string | null>;
  etherscanLabel?: Sourced<string | null>;
  tokenSymbol?: Sourced<string | null>;
  labels?: string[];
  ensName?: string | null;
  url?: string | null;
  description?: string | null;
  notes?: string[];
  implementation?: {
    address: MaybeSourced<string>;
    contractName?: MaybeSourced<string | null>;
    etherscanLabel?: MaybeSourced<string | null>;
    tokenSymbol?: MaybeSourced<string | null>;
    labels?: string[];
    ensName?: string | null;
  };
};

/** Map of address -> SourcedAddressMetadata */
export type SourcedAddressMetadataMap = Record<string, SourcedAddressMetadata>;

// Legacy aliases for backward compatibility
export type SourcedCallInsight = CallInsight;
export type SourcedSerializedDecodedFunction = SerializedDecodedFunction;
export type SourcedSerializedCallNode = SerializedCallNode;
export type SourcedSerializedDecodedProposal = SerializedDecodedProposal;

/** Extended decode request with source tracking option */
export type DecodeRequestWithOptions = DecodeRequest & {
  options?: {
    trackSources?: boolean;
  };
};

/** Extended decode response with source tracking */
export type SourcedDecodeResponse =
  | { success: true; data: SourcedSerializedDecodedProposal }
  | { success: false; error: string };
