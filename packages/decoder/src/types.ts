import { ParamType } from "ethers";
import type { DataSource, Sourced } from "./types/sources.js";

// Re-export source types
export * from "./types/sources.js";
export type {
  DataSource,
  Sourced,
  CalldataSource,
  EtherscanAbiSource,
  EtherscanTagSource,
  EtherscanSourcecodeSource,
  OnChainSource,
  StaticMetadataSource,
  HandlerSource,
  DerivedSource,
  ExternalApiSource,
  HardcodedSource,
  LocalAbiSource,
} from "./types/sources.js";

/** Options for decoder functions */
export type DecoderOptions = {
  /**
   * Enable source tracking for data provenance.
   * When true, fields may include source information indicating
   * where the data came from (calldata, Etherscan, on-chain, etc.)
   * @default false
   */
  trackSources?: boolean;
};

/** Serializable parameter info that captures essential ParamType data for the portal */
export type SerializableParamInfo = {
  name: string;
  type: string;         // Full type string e.g. "address", "uint256", "tuple(address,uint256)[]"
  baseType: string;     // Base type: "address", "uint", "tuple", "array", etc.
  components?: SerializableParamInfo[];  // For tuples
  arrayChildren?: SerializableParamInfo; // For arrays
};

/** Address metadata (non-sourced version for backward compatibility) */
export type AddressMetadata = {
  /** Contract name reported by Etherscan's source-code endpoint */
  contractName?: string | null;
  /** User-facing label/tag from Etherscan's contract info endpoint */
  etherscanLabel?: string | null;
  /** Optional token symbol if the address tracks an ERC token */
  tokenSymbol?: string | null;
  /** Additional label categories returned by the metadata API */
  labels?: string[];
  /** ENS name if provided via metadata */
  ensName?: string | null;
  /** Public metadata URL associated with the address */
  url?: string | null;
  /** Short description supplied by the metadata API */
  description?: string | null;
  /** Notes supplied by the metadata API */
  notes?: string[];
  /** If detected as a proxy, the implementation it points to */
  implementation?: {
    address: string;
    contractName?: string | null;
    etherscanLabel?: string | null;
    tokenSymbol?: string | null;
    labels?: string[];
    ensName?: string | null;
  };
};

/** Address metadata with source tracking */
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
    address: Sourced<string>;
    contractName?: Sourced<string | null>;
    etherscanLabel?: Sourced<string | null>;
    tokenSymbol?: Sourced<string | null>;
    labels?: string[];
    ensName?: string | null;
  };
};

export type AddressMetadataMap = Record<string, AddressMetadata>;

export type CallInsightEntry = {
  label: string | Sourced<string>;
  value: string | Sourced<string>;
  /** Optional metadata for the entry (e.g., resolved address info) */
  metadata?: {
    /** If value is an address, the resolved name */
    resolvedName?: string | Sourced<string>;
    /** If value is an address, the chain for explorer links */
    chainId?: number;
    /** Type hint for rendering */
    type?: "address" | "number" | "percent" | "text";
  };
};

export type CallInsight = {
  title: string;
  entries: CallInsightEntry[];
  /** Source tracking: which handler produced this insight */
  _handlerSource?: DataSource;
};

export type DecodedFunction = {
  name: MaybeSourced<string>; // e.g. "transfer" - from ABI
  signature: MaybeSourced<string>; // e.g. "transfer(address,uint256)" - from ABI
  selector: MaybeSourced<string>; // 0x... - from calldata
  args: unknown[]; // humanized via toReadableArg
  argSources?: DataSource[]; // Source for each arg (calldata offset tracking)
  argTypes: string[]; // ["address", "uint256", ...]
  argParams: ParamType[]; // full param metadata
  argParamInfo?: SerializableParamInfo[]; // serializable param metadata for portal
  rawArgs?: unknown[]; // original ethers Result values (for metadata traversal)
  addressMetadata?: AddressMetadataMap | SourcedAddressMetadataMap; // resolved labels for any address arguments
};

export type SourcedAddressMetadataMap = Record<string, SourcedAddressMetadata>;

/** How a child call was produced from its parent (for UI + reasoning) */
export type CallEdge = {
  type: MaybeSourced<"bridge" | "multicall" | "delegatecall" | "call" | "staticcall" | "other">;
  /** If the call crosses chains, specify destination chainId (e.g. 59144 for Linea) */
  chainId?: MaybeSourced<number>;
  /** Optional label for UX ("Linea Message Service", "GnosisSafe.execTransaction", etc.) */
  label?: MaybeSourced<string>;
  /** Optional freeform metadata (batch index, fee, salt, etc.) */
  meta?: Record<string, unknown>;
  /** Source for this edge (which handler determined it) */
  _source?: DataSource;
};


/** Helper type for values that may be sourced */
export type MaybeSourced<T> = T | Sourced<T>;

/** A node in the decoded call tree - fields may be sourced when trackSources is enabled */
export type CallNode = {
  /** The chain this node executes on (parent -> child can differ for bridges) */
  chainId: MaybeSourced<number>;

  /** Calldata target + optional resolved name on this chain */
  target: MaybeSourced<string>;
  targetContractName?: MaybeSourced<string>;

  /** Implementation address if this is a delegatecall */
  implementation?: MaybeSourced<string>;
  implementationContractName?: MaybeSourced<string>;

  /** ETH value sent with this call (wei) */
  valueWei: MaybeSourced<bigint>;

  /** Raw calldata for this call (0x...) */
  rawCalldata: MaybeSourced<string>;

  /** If ABI found and selector matched */
  decoded?: DecodedFunction;

  /** Notes for the user (warnings, fallbacks, cache misses, etc.) */
  notes?: string[];

  /** Supplemental insights produced by handlers (view lookups, metadata, etc.) */
  insights?: CallInsight[];

  /** Nested calls derived from this node (bridge payloads, multicall items, etc.) */
  children?: Array<{
    edge: CallEdge; // how we got this child (and destination chainId if bridged)
    node: CallNode; // the child call itself
  }>;
};


/** A proposal becomes a forest of call trees */
export type DecodedProposal = {
  governor: MaybeSourced<string>;
  proposalId: MaybeSourced<bigint>;
  descriptionHash: MaybeSourced<string>;
  calls: CallNode[]; // one root per on-chain action
};


/** Raw on-chain details from the governor */
export type ProposalDetails = {
  targets: string[];
  values: bigint[];
  calldatas: string[];
  descriptionHash: string;
};
