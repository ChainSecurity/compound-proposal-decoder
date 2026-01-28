import { Interface } from "ethers";
import { checksum } from "../utils.js";
import { child, type Handler, type RegistryCtx } from "../registry.js";

/**
 * Scroll Messenger (L1 → Scroll):
 * sendMessage(address target, uint256 value, bytes message, uint256 gasLimit, address refundAddress)
 * Destination chain: 534352 (Scroll)
 */
const SCROLL_CHAIN_ID = 534352;
const L1_SCROLL_MESSENGER = checksum("0x6774Bcbd5ceCeF1336b5300fb5186a12DDD8b367");
const SIG = "sendMessage(address,uint256,bytes,uint256)";
const ifaceNamed = new Interface([
  "function sendMessage(address target, uint256 value, bytes message, uint256 gasLimit)",
]);
const iface = new Interface([`function ${SIG}`]);
const SEL = iface.getFunction(SIG)!.selector;

export const scrollBridgeHandler: Handler = {
  name: "Scroll Messenger",
  match: (ctx: RegistryCtx) => {
    if (ctx.chainId !== 1) return false;
    if (checksum(ctx.target) !== L1_SCROLL_MESSENGER) return false;
    const selector = ctx.rawCalldata?.slice(0, 10) ?? "0x00000000";
    return selector === SEL;
  },

  expand: (ctx: RegistryCtx) => {
    try {
      // Prefer named decode (gives args._to / ._calldata)
      const p = ifaceNamed.parseTransaction({ data: ctx.rawCalldata });
      const to = checksum(p?.args._to);
      const payload: string = p?.args._calldata;
      return [
        child(
          { type: "bridge", chainId: SCROLL_CHAIN_ID, label: "Scroll Message Service" },
          { chainId: SCROLL_CHAIN_ID, target: to, rawCalldata: payload }
        ),
      ];
    } catch {
      // Fallback positional
      const p = iface.parseTransaction({ data: ctx.rawCalldata });
      const to = checksum(p?.args[0]);
      const payload: string = p?.args[2];
      return [
        child(
          { type: "bridge", chainId: SCROLL_CHAIN_ID, label: "Scroll Message Service" },
          { chainId: SCROLL_CHAIN_ID, target: to, rawCalldata: payload }
        ),
      ];
    }
}
    
};
