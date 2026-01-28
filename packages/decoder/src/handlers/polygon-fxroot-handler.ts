import { Interface } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * Polygon FxRoot (FxPortal) — message bridge to Polygon
 *
 * sendMessageToChild(
 *   address _receiver,
 *   bytes _data
 * )
 *
 * We expand into a child call on Polygon (chainId 137):
 *   - target:     _receiver
 *   - calldata:   _data
 *   - valueWei:   0n                   // FxPortal doesn't transfer native tokens
 * Edge metadata captures the bridge type and sender information.
 */

const SIG = "sendMessageToChild(address,bytes)";
const SELECTOR = selectorOfSig(SIG);

// Named + minimal ABIs (named preferred)
const iface = new Interface([
  "function sendMessageToChild(address _receiver, bytes _data)",
]);

// Known FxRoot addresses → destination L2 chainId + label
const KNOWN_FXROOTS: Record<string, { label: string; destChainId: number }> = {
  // Polygon FxRoot on Ethereum mainnet
  "0xfe5e5D361b2ad62c541bAb87C45a0B9B018389a2": {
    label: "FxRoot (Polygon)",
    destChainId: 137,
  },
};

export const polygonFxRootHandler: Handler = {
  name: "Polygon FxRoot (message bridge)",
  match: (ctx: RegistryCtx) => {
    if (ctx.chainId !== 1) return false;
    const fxRoot = KNOWN_FXROOTS[checksum(ctx.target)];
    if (!fxRoot) return false;

    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === SELECTOR;
  },

  expand: (ctx: RegistryCtx) => {
    const fxRoot = KNOWN_FXROOTS[checksum(ctx.target)];
    if (!fxRoot) {
      logger.error(
        { target: checksum(ctx.target) },
        "FxRoot not found in KNOWN_FXROOTS despite match()"
      );
      return [];
    }

    try {
      // Prefer named parse
      const p = iface.parseTransaction({ data: ctx.rawCalldata });
      if (!p) {
        logger.error(
          { target: checksum(ctx.target), data: ctx.rawCalldata },
          "Failed to parse FxRoot sendMessageToChild despite match()"
        );
        return [];
      }

      const receiver = checksum(p.args._receiver);
      const payload: string = p.args._data;

      return [
        child(
          {
            type: "bridge",
            chainId: fxRoot.destChainId,
            label: "FxRoot (Polygon)",
            meta: {
              // FxPortal doesn't transfer native tokens, but we can note if ETH was sent
              l1MsgValue: ctx.valueWei?.toString(),
            },
          },
          {
            chainId: fxRoot.destChainId,
            target: receiver,
            rawCalldata: payload,
            valueWei: 0n, // FxPortal doesn't transfer native tokens
          }
        ),
      ];
    } catch {
      logger.warn(
        { target: checksum(ctx.target), data: ctx.rawCalldata },
        "Failed to parse FxRoot sendMessageToChild despite match()"
      );
      return [];
    }
  },
};