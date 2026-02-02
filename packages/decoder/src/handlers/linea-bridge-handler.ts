import { Interface } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * Linea Message Service bridge:
 * sendMessage(address _to, uint256 _fee, bytes _calldata)
 * Destination chain: 59144
 */
const LINEA_BRIDGE_ADDR = checksum("0xd19d4B5d358258f05D7B411E21A1460D11B0876F");
const LINEA_CHAIN_ID = 59144;
const SIG = "sendMessage(address,uint256,bytes)";
const SELECTOR = selectorOfSig(SIG);

const iface = new Interface([
  "function sendMessage(address _to, uint256 _fee, bytes _calldata)",
]);

export const lineaBridgeHandler: Handler = {
  name: "Linea Message Service",
  match: (ctx: RegistryCtx) => {
    if (checksum(ctx.target) !== LINEA_BRIDGE_ADDR) return false;
    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === SELECTOR;
  },
  expand: (ctx: RegistryCtx) => {
    try {
      const p = iface.parseTransaction({ data: ctx.rawCalldata });
      const to = checksum(p?.args._to);
      const payload: string = p?.args._calldata;
      return [
        child(
          { type: "bridge", chainId: LINEA_CHAIN_ID, label: "Linea Message Service" },
          { chainId: LINEA_CHAIN_ID, target: to, rawCalldata: payload }
        ),
      ];
    } catch {
      logger.warn({ data: ctx.rawCalldata }, "Failed to decode Linea Message Service payload");
      return [];
    }
  },
};
