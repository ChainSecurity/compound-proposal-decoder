import { ParamType } from "ethers";

/** A successfully decoded function call */
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

export type AddressMetadataMap = Record<string, AddressMetadata>;

export type CallInsightEntry = {
  label: string;
  value: string;
};

export type CallInsight = {
  title: string;
  entries: CallInsightEntry[];
};

export type DecodedFunction = {
  name: string; // e.g. "transfer"
  signature: string; // e.g. "transfer(address,uint256)"
  selector: string; // 0x...
  args: unknown[]; // humanized via toReadableArg
  argTypes: string[]; // ["address", "uint256", ...]
  argParams: ParamType[]; // full param metadata
  rawArgs?: unknown[]; // original ethers Result values (for metadata traversal)
  addressMetadata?: AddressMetadataMap; // resolved labels for any address arguments
};

/** How a child call was produced from its parent (for UI + reasoning) */
export type CallEdge = {
  type: "bridge" | "multicall" | "delegatecall" | "call" | "staticcall" | "other";
  /** If the call crosses chains, specify destination chainId (e.g. 59144 for Linea) */
  chainId?: number;
  /** Optional label for UX ("Linea Message Service", "GnosisSafe.execTransaction", etc.) */
  label?: string;
  /** Optional freeform metadata (batch index, fee, salt, etc.) */
  meta?: Record<string, unknown>;
};

/** A node in the decoded call tree */
export type CallNode = {
  /** The chain this node executes on (parent -> child can differ for bridges) */
  chainId: number;

  /** Calldata target + optional resolved name on this chain */
  target: string;
  targetContractName?: string | undefined;

  /** Implementation address if this is a delegatecall */
  implementation?: string | undefined;
  implementationContractName?: string | undefined;

  /** ETH value sent with this call (wei) */
  valueWei: bigint;

  /** Raw calldata for this call (0x...) */
  rawCalldata: string;

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
  governor: string;
  proposalId: bigint;
  descriptionHash: string;
  calls: CallNode[]; // one root per on-chain action
};

/** Raw on-chain details from the governor */
export type ProposalDetails = {
  targets: string[];
  values: bigint[];
  calldatas: string[];
  descriptionHash: string;
};
