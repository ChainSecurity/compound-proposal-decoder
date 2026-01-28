import { Interface } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * Optimism-style CrossDomainMessenger (Bedrock):
 * sendMessage(address _target, bytes _message, uint32 _minGasLimit) payable
 *
 * The _message that gets delivered on the other side is:
 * relayMessage(uint256 _nonce, address _sender, address _target, uint256 _value, uint256 _minGasLimit, bytes _message)
 *
 * We expand into a child call on the *other* chain:
 * - target: _target
 * - calldata: _message
 * - value: msg.value (from the parent call)
 */

const SIG = "sendMessage(address,bytes,uint32)";
const SELECTOR = selectorOfSig(SIG);

const iface = new Interface([
  "function sendMessage(address _target, bytes _message, uint32 _minGasLimit) payable",
]);

const KNOWN_MESSENGERS: Record<number, Record<string, { label: string; destChainId: number }>> = {
  1: {
    "0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1": {
      label: "L1CrossDomainMessenger (Optimism)",
      destChainId: 10,
    },
    "0x866E82a600A1414e583f7F13623F1aC5d58b0Afa": {
      label: "L1CrossDomainMessenger (Base)",
      destChainId: 8453,
    },
    "0x9A3D64E386C18Cb1d6d5179a9596A4B5736e98A6": {
      label: "L1CrossDomainMessenger (Unichain)",
      destChainId: 130,
    },
    "0x676A795fe6E43C17c668de16730c3F690FEB7120": {
      label: "L1CrossDomainMessenger (Mantle)",
      destChainId: 5000,
    },
  },
};

export const opCrossDomainMessengerHandler: Handler = {
  name: "OP CrossDomainMessenger",
  match: (ctx: RegistryCtx) => {
    if (KNOWN_MESSENGERS[ctx.chainId]?.[checksum(ctx.target)]) {
      const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
      return sel === SELECTOR;
    }
    return false;
  },

  expand: (ctx: RegistryCtx) => {
    try {
      const p = iface.parseTransaction({ data: ctx.rawCalldata });
      const to = checksum(p?.args._target);
      const payload: string = p?.args._message;
      const minGas: number = Number(p?.args._minGasLimit);

      const messengerKey = checksum(ctx.target);
      const known = KNOWN_MESSENGERS[ctx.chainId]?.[messengerKey];
      if (!known) {
        logger.error(
          { messenger: messengerKey },
          "KNOWN_MESSENGERS entry missing destChainId but should have been checked in the match() function"
        );
        return [];
      }
      const edge = {
        type: "bridge" as const,
        chainId: known.destChainId, // may be undefined if unknown
        label: known.label,
        meta: { minGasLimit: minGas },
      };

      return [
        child(edge, {
          chainId: known?.destChainId ?? ctx.chainId, // fall back to same chain if unknown
          target: to,
          rawCalldata: payload,
          valueWei: ctx.valueWei ?? 0n,
        }),
      ];
    } catch {
      logger.warn(
        { target: checksum(ctx.target), data: ctx.rawCalldata },
        "Failed to parse OP CrossDomainMessenger despite match()"
      );
      return [];
    }
  },
};
