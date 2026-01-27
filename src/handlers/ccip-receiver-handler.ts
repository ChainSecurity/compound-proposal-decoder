import { AbiCoder } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * CCIP Bridge Receiver Handler
 *
 * Decodes batched governance transactions received via CCIP.
 * The receiver contract's fallback is called with msg.data = abi.encode(
 *   address[] targets, uint256[] values, string[] signatures, bytes[] calldatas
 * )
 *
 * We decode that tuple and expand into one child per queued transaction.
 */

const KNOWN_RECEIVERS: Record<number, Record<string, { label: string }>> = {
  2020: {
    "0x2c7EfA766338D33B9192dB1fB5D170Bdc03ef3F9": { label: "CCIPReceiver (Ronin)" },
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

export const ccipReceiverHandler: Handler = {
  name: "CCIP Bridge Receiver (queued actions)",
  match: (ctx: RegistryCtx) => {
    if (!KNOWN_RECEIVERS[ctx.chainId]?.[checksum(ctx.target)]) return false;

    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === "0x00000000";
  },

  expand: (ctx: RegistryCtx) => {
    const data = ctx.rawCalldata;
    if (!data || data === "0x") return [];

    // Strip the zero selector prefix if present
    const payloadData = data.startsWith("0x00000000") ? "0x" + data.slice(10) : data;

    const decoded = tryDecodeTuple(payloadData);
    if (!decoded) {
      logger.warn({ data: payloadData.slice(0, 100) }, "Failed to decode CCIPReceiver payload");
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
              KNOWN_RECEIVERS[ctx.chainId]?.[checksum(ctx.target)]?.label || "CCIPReceiver"
            } Queued Transaction`,
            meta: { index: i, signature },
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
