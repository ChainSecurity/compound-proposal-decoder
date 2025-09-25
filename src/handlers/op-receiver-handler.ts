import { AbiCoder } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * OptimismBridgeReceiver — receiving side for OP-stack chains
 *
 * The messenger calls receiver.fallback() with msg.data = abi.encode(
 *   address[] targets, uint256[] values, string[] signatures, bytes[] calldatas
 * )
 *
 * We decode that tuple and expand into one child per queued transaction on THIS chain.
 */

const KNOWN_RECEIVERS: Record<number, Record<string, { label: string }>> = {
  10: {
    "0xC3a73A70d1577CD5B02da0bA91C0Afc8fA434DAF": { label: "OptimismBridgeReceiver (Optimism)" },
  },
  130: {
    "0x4b5DeE60531a72C1264319Ec6A22678a4D0C8118": { label: "OptimismBridgeReceiver (Unichain)" },
  },
  8453: {
    "0x18281dfC4d00905DA1aaA6731414EABa843c468A": { label: "OptimismBridgeReceiver (Base)" },
  },
  5000: {
    "0xc91EcA15747E73d6dd7f616C49dAFF37b9F1B604": { label: "OptimismBridgeReceiver (Mantle)" },
  },
};

const coder = AbiCoder.defaultAbiCoder();
const TUPLE_TYPES = ["address[]", "uint256[]", "string[]", "bytes[]"] as const;

function tryDecodeTuple(data: string) {
  try {
    const [targets, values, signatures, calldatas] = coder.decode(TUPLE_TYPES, data);

    if (
      Array.isArray(targets) &&
      Array.isArray(values) &&
      Array.isArray(signatures) &&
      Array.isArray(calldatas) &&
      targets.length === values.length &&
      targets.length === signatures.length &&
      targets.length === calldatas.length
    ) {
      return { targets, values, signatures, calldatas };
    }
  } catch {
    // not decodable
  }
  return null;
}

export const opReceiverHandler: Handler = {
  name: "OptimismBridgeReceiver (queued actions)",
  match: (ctx: RegistryCtx) => {
    if (!KNOWN_RECEIVERS[ctx.chainId]?.[checksum(ctx.target)]) return false;

    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === "0x00000000";
  },

  expand: (ctx: RegistryCtx) => {
    const data = ctx.rawCalldata;
    if (!data || data === "0x") return [];

    const decoded = tryDecodeTuple(data);
    if (!decoded) {
      logger.warn({ data }, "Failed to decode OptimismBridgeReceiver payload");
      return [];
    }

    const { targets, values, signatures, calldatas } = decoded;
    const children = [];

    for (let i = 0; i < targets.length; i++) {
      const target = checksum(targets[i]!);
      const valueWei = BigInt(values[i]!.toString());
      const signature = signatures[i]!;
      const calldata = calldatas[i]!;

      const selector = selectorOfSig(signature);
      const rawCalldata = selector + calldata.slice(2);

      children.push(
        child(
          {
            type: "multicall",
            label: `${
              KNOWN_RECEIVERS[ctx.chainId]?.[checksum(ctx.target)]?.label || "OptimismBridgeReceiver"
            } Queued Transaction`,
            meta: { index: i, signature: selector },
          },
          {
            chainId: ctx.chainId,
            target: target,
            rawCalldata: rawCalldata,
            valueWei: valueWei,
          }
        )
      );
    }

    return children;
  },
};