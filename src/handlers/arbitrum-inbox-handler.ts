import { Interface } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * Arbitrum L1 Inbox (Arbitrum One) — retryable tickets
 *
 * createRetryableTicket(
 *   address to,
 *   uint256 l2CallValue,
 *   uint256 maxSubmissionCost,
 *   address excessFeeRefundAddress,
 *   address callValueRefundAddress,
 *   uint256 gasLimit,
 *   uint256 maxFeePerGas,
 *   bytes data
 * ) payable
 *
 * We expand into a child call on Arbitrum One (chainId 42161):
 *   - target:     to
 *   - calldata:   data
 *   - valueWei:   l2CallValue          // ONLY this value is delivered to L2 target
 * Edge metadata captures the fee parameters and refund addresses.
 */

const SIG =
  "createRetryableTicket(address,uint256,uint256,address,address,uint256,uint256,bytes)";
const SELECTOR = selectorOfSig(SIG);

// Named + minimal ABIs (named preferred)
const iface = new Interface([
  "function createRetryableTicket(address to, uint256 l2CallValue, uint256 maxSubmissionCost, address excessFeeRefundAddress, address callValueRefundAddress, uint256 gasLimit, uint256 maxFeePerGas, bytes data) payable",
]);

// Known L1 Inbox addresses → destination L2 chainId + label
const KNOWN_INBOXES: Record<string, { label: string; destChainId: number }> = {
  // Arbitrum One L1 Inbox (TransparentUpgradeableProxy at this address)
  "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f": {
    label: "Arbitrum Inbox (Arbitrum One)",
    destChainId: 42161,
  },

  // (Optional) Add Nova, Stylus testnets, Orbit chains, etc. as needed:
  // "0x...": { label: "Arbitrum Nova Inbox", destChainId: 42170 },
};

export const arbitrumRetryableHandler: Handler = {
  name: "Arbitrum Inbox (retryable ticket)",
  match: (ctx: RegistryCtx) => {
    if (ctx.chainId !== 1) return false;
    const inbox = KNOWN_INBOXES[checksum(ctx.target)];
    if (!inbox) return false;

    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === SELECTOR;
  },

  expand: (ctx: RegistryCtx) => {
    const inbox = KNOWN_INBOXES[checksum(ctx.target)];
    if (!inbox) {
      logger.error(
        { target: checksum(ctx.target) },
        "Inbox not found in KNOWN_INBOXES despite match()"
      );
      return [];
    }

    try {
      // Prefer named parse
      const p = iface.parseTransaction({ data: ctx.rawCalldata });
      if (!p) {
        logger.error(
          { target: checksum(ctx.target), data: ctx.rawCalldata },
          "Failed to parse Arbitrum createRetryableTicket despite match()"
        );
        return [];
      }

      const to = checksum(p.args.to);
      const l2CallValue = BigInt(p.args.l2CallValue.toString());
      const maxSubmissionCost = BigInt(p.args.maxSubmissionCost.toString());
      const excessFeeRefundAddress = checksum(p.args.excessFeeRefundAddress);
      const callValueRefundAddress = checksum(p.args.callValueRefundAddress);
      const gasLimit = BigInt(p.args.gasLimit.toString());
      const maxFeePerGas = BigInt(p.args.maxFeePerGas.toString());
      const payload: string = p.args.data;

      return [
        child(
          {
            type: "bridge",
            chainId: inbox.destChainId,
            label: "Arbitrum Inbox (retryable)",
            meta: {
              maxSubmissionCost: maxSubmissionCost.toString(),
              gasLimit: gasLimit.toString(),
              maxFeePerGas: maxFeePerGas.toString(),
              excessFeeRefundAddress,
              callValueRefundAddress,
              // FYI: msg.value on L1 covers submission cost + L2 gas + l2CallValue.
              // Only l2CallValue is delivered to `to` on L2.
              l1MsgValue: ctx.valueWei?.toString(),
              l2CallValue: l2CallValue.toString(),
            },
          },
          {
            chainId: inbox.destChainId,
            target: to,
            rawCalldata: payload,
            valueWei: l2CallValue,
          }
        ),
      ];
    } catch {
      logger.warn(
        { target: checksum(ctx.target), data: ctx.rawCalldata },
        "Failed to parse Arbitrum createRetryableTicket despite match()"
      );
      return [];
    }
  },
};
