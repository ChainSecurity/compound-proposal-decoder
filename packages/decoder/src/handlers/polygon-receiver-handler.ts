import { AbiCoder } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * PolygonBridgeReceiver (Polygon) — receiving side
 *
 * The bridge delivers raw data to the receiver with msg.data = abi.encode(
 *   address[] targets, uint256[] values, string[] signatures, bytes[] calldatas
 * )
 *
 * We decode that tuple and expand into one child per queued transaction on THIS chain.
 */

const KNOWN_RECEIVERS: Record<string, { label: string }> = {
  [checksum("0x18281dfC4d00905DA1aaA6731414EABa843c468A")]: {
    label: "PolygonBridgeReceiver (Polygon)",
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

export const polygonReceiverHandler: Handler = {
  name: "PolygonBridgeReceiver (queued actions)",
  match: (ctx: RegistryCtx) => {
    if (ctx.chainId !== 137) return false;
    if (!KNOWN_RECEIVERS[checksum(ctx.target)]) return false;

    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === "0x00000000";
  },

  expand: (ctx: RegistryCtx) => {
    const data = ctx.rawCalldata;
    if (!data || data === "0x") return [];

    const decoded = tryDecodeTuple(data);
    if (!decoded) {
      logger.warn({ data }, "Failed to decode PolygonBridgeReceiver payload");
      return [];
    }

    const { targets, values, signatures, calldatas } = decoded;
    const children = [];

    for (let i = 0; i < targets.length; i++) {
      const target = checksum(targets[i]!);
      const valueWei = BigInt(values[i]!.toString());
      const signature = signatures[i]!;
      const calldata = calldatas[i]!;

      // If signature is empty, calldata already contains the full data with selector
      // If signature is provided, we need to compute selector and prepend it
      let rawCalldata: string;
      let selector: string;
      
      if (!signature || signature === "") {
        // Calldata already contains the selector
        rawCalldata = calldata;
        selector = calldata.slice(0, 10); // Extract selector for metadata
      } else {
        // Compute selector from signature and prepend to calldata
        selector = selectorOfSig(signature);
        rawCalldata = selector + calldata.slice(2);
      }

      children.push(
        child(
          {
            type: "multicall",
            label: `${KNOWN_RECEIVERS[checksum(ctx.target)].label} Queued Transaction`,
            meta: { index: i, signature: signature || selector },
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