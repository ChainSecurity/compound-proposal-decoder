import { AbiCoder, Interface } from "ethers";
import type { CrossChainAction } from "./types.js";
import {
  arbitrumBridgeABI,
  opCdmBridgeABI,
  scrollBridgeABI,
  lineaBridgeABI,
  polygonBridgeABI,
  ccipBridgeABI,
} from "./abis.js";
import { loadConfig } from "./config.js";

// ── Bridge registry ────────────────────────────────────────────────

interface BridgeEntry {
  chainName: string;
  bridgeType: string;
}

/**
 * Map of L1 bridge contract address (checksummed) → chain info.
 * Mirrors BRIDGE_CONTRACTS in packages/decoder/src/decoder.ts
 */
const BRIDGE_REGISTRY: Record<string, BridgeEntry> = {
  "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f": { chainName: "arbitrum", bridgeType: "arbitrum" },
  "0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1": { chainName: "optimism", bridgeType: "op-cdm" },
  "0x866E82a600A1414e583f7F13623F1aC5d58b0Afa": { chainName: "base", bridgeType: "op-cdm" },
  "0x676A795fe6E43C17c668de16730c3F690FEB7120": { chainName: "mantle", bridgeType: "op-cdm" },
  "0x9A3D64E386C18Cb1d6d5179a9596A4B5736e98A6": { chainName: "unichain", bridgeType: "op-cdm" },
  "0x6774Bcbd5ceCeF1336b5300fb5186a12DDD8b367": { chainName: "scroll", bridgeType: "scroll" },
  "0xd19d4B5d358258f05D7B411E21A1460D11B0876F": { chainName: "linea", bridgeType: "linea" },
  "0xfe5e5D361b2ad62c541bAb87C45a0B9B018389a2": { chainName: "polygon", bridgeType: "polygon" },
  "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D": { chainName: "__ccip__", bridgeType: "ccip" },
};

/**
 * CCIP destination chain selectors → config chain names.
 * Mirrors CCIP_CHAIN_SELECTORS in packages/simulator/src/core/constants.ts
 */
const CCIP_CHAIN_SELECTORS: Record<string, string> = {
  "6916147374840168594": "ronin",
};

/**
 * Inner payload tuple types — all bridges encode proposal data identically.
 * abi.decode(payload, (address[], uint256[], string[], bytes[]))
 */
const TUPLE_TYPES = ["address[]", "uint256[]", "string[]", "bytes[]"] as const;

// ── Bridge ABI interfaces ──────────────────────────────────────────

const bridgeInterfaces: Record<string, { iface: Interface; messageArgIndex: number }> = {
  arbitrum: { iface: new Interface(arbitrumBridgeABI), messageArgIndex: 7 },
  "op-cdm": { iface: new Interface(opCdmBridgeABI), messageArgIndex: 1 },
  scroll: { iface: new Interface(scrollBridgeABI), messageArgIndex: 2 },
  linea: { iface: new Interface(lineaBridgeABI), messageArgIndex: 2 },
  polygon: { iface: new Interface(polygonBridgeABI), messageArgIndex: 1 },
  ccip: { iface: new Interface(ccipBridgeABI), messageArgIndex: -1 }, // special handling
};

const coder = AbiCoder.defaultAbiCoder();

// ── Public API ─────────────────────────────────────────────────────

/**
 * Detect if a proposal action targets a known bridge contract.
 * If so, decode the calldata and extract the inner cross-chain targets.
 *
 * Returns null if the target is not a bridge contract.
 */
export function detectBridgeAction(
  actionIndex: number,
  target: string,
  calldata: string,
): CrossChainAction | null {
  // Look up bridge by address (case-insensitive)
  const entry = Object.entries(BRIDGE_REGISTRY).find(
    ([addr]) => addr.toLowerCase() === target.toLowerCase(),
  );
  if (!entry) return null;

  const [, bridge] = entry;
  let { chainName } = bridge;
  const { bridgeType } = bridge;

  try {
    let innerPayload: string;

    if (bridgeType === "ccip") {
      // CCIP: parse ccipSend to get destination chain + message.data
      const { iface } = bridgeInterfaces.ccip!;
      const parsed = iface.parseTransaction({ data: calldata });
      if (!parsed) return null;

      const chainSelector = parsed.args[0].toString();
      chainName = CCIP_CHAIN_SELECTORS[chainSelector] ?? `ccip-${chainSelector}`;
      // message tuple: (receiver, data, tokenAmounts, feeToken, extraArgs)
      innerPayload = parsed.args[1][1]; // message.data
    } else {
      const bridgeDef = bridgeInterfaces[bridgeType];
      if (!bridgeDef) return null;
      const parsed = bridgeDef.iface.parseTransaction({ data: calldata });
      if (!parsed) return null;
      innerPayload = parsed.args[bridgeDef.messageArgIndex];
    }

    // Decode inner payload: (address[] targets, uint256[] values, string[] sigs, bytes[] calldatas)
    const decoded = coder.decode(TUPLE_TYPES, innerPayload);
    const innerTargets = Array.from(decoded[0] as string[]);

    // Look up chain ID and receiver from config
    const config = loadConfig();
    const chainConfig = config.chains[chainName];
    const chainId = chainConfig?.chainId ?? 0;
    const receiverAddress = chainConfig?.receiver ?? "";

    return {
      actionIndex,
      bridgeType,
      chainName,
      chainId,
      receiverAddress,
      innerTargets,
    };
  } catch {
    // Failed to decode — not a recognized bridge call pattern
    return null;
  }
}
