import { Interface, AbiCoder } from "ethers";
import { checksum } from "@/utils";
import { child, selectorOfSig, type Handler, type RegistryCtx } from "@/registry";
import { logger } from "@/logger";

/**
 * Chainlink CCIP Router Handler
 *
 * Detects ccipSend(uint64 destinationChainSelector, tuple message) calls
 * and expands to the destination chain with the message payload.
 *
 * The message tuple structure (Client.EVM2AnyMessage):
 *   - receiver (bytes): ABI-encoded destination address
 *   - data (bytes): The payload to deliver
 *   - tokenAmounts (tuple[]): Token transfers (usually empty for governance)
 *   - feeToken (address): Fee payment token (0x0 = native)
 *   - extraArgs (bytes): Additional CCIP args
 */

const SIG = "ccipSend(uint64,(bytes,bytes,(address,uint256)[],address,bytes))";
const SELECTOR = selectorOfSig(SIG);

const iface = new Interface([
  `function ccipSend(uint64 destinationChainSelector, tuple(bytes receiver, bytes data, tuple(address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) external payable returns (bytes32)`,
]);

const coder = AbiCoder.defaultAbiCoder();

// CCIP chain selectors to standard chain IDs
// Source: https://github.com/smartcontractkit/chain-selectors
const CCIP_CHAIN_SELECTORS: Record<string, { chainId: number; name: string }> = {
  "5009297550715157269": { chainId: 1, name: "Ethereum Mainnet" },
  "15971525489660198786": { chainId: 8453, name: "Base" },
  "4051577828743386545": { chainId: 137, name: "Polygon" },
  "4949039107694359620": { chainId: 42161, name: "Arbitrum One" },
  "3734403246176062136": { chainId: 10, name: "Optimism" },
  "6916147374840168594": { chainId: 2020, name: "Ronin" },
  "11344663589394136015": { chainId: 56, name: "BNB Chain" },
  "6433500567565415381": { chainId: 43114, name: "Avalanche" },
};

// Known CCIP Router addresses per chain
const KNOWN_ROUTERS: Record<number, string[]> = {
  1: ["0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D"], // Ethereum mainnet
};

export const ccipRouterHandler: Handler = {
  name: "CCIP Router",
  match: (ctx: RegistryCtx) => {
    const routers = KNOWN_ROUTERS[ctx.chainId];
    if (!routers?.includes(checksum(ctx.target))) return false;

    const sel = ctx.rawCalldata?.slice(0, 10) || "0x00000000";
    return sel === SELECTOR;
  },

  expand: (ctx: RegistryCtx) => {
    try {
      const parsed = iface.parseTransaction({ data: ctx.rawCalldata });
      if (!parsed) return [];

      const destinationChainSelector = parsed.args[0].toString();
      const message = parsed.args[1];

      // Extract receiver address from bytes (it's ABI-encoded)
      const receiverBytes: string = message.receiver;
      let receiver: string;
      try {
        const [decodedReceiver] = coder.decode(["address"], receiverBytes);
        receiver = checksum(decodedReceiver);
      } catch {
        // Fallback: try to extract address directly if it's zero-padded
        if (receiverBytes.length === 66) {
          receiver = checksum("0x" + receiverBytes.slice(26));
        } else {
          logger.warn({ receiverBytes }, "Failed to decode CCIP receiver address");
          return [];
        }
      }

      const data: string = message.data;
      const feeToken: string = message.feeToken;

      // Map chain selector to chain ID
      const destChain = CCIP_CHAIN_SELECTORS[destinationChainSelector];
      if (!destChain) {
        logger.warn(
          { destinationChainSelector },
          "Unknown CCIP destination chain selector"
        );
        return [];
      }

      const edge = {
        type: "bridge" as const,
        chainId: destChain.chainId,
        label: `CCIP Router (Chainlink) → ${destChain.name}`,
        meta: {
          destinationChainSelector,
          feeToken: checksum(feeToken),
        },
      };

      // The receiver contract will be called with the data as calldata
      // Most governance receivers expect a fallback call with the batch data
      // Prepend zero selector to indicate fallback
      const rawCalldata = data.startsWith("0x") ? "0x00000000" + data.slice(2) : "0x00000000" + data;

      return [
        child(edge, {
          chainId: destChain.chainId,
          target: receiver,
          rawCalldata,
          valueWei: 0n,
        }),
      ];
    } catch (err) {
      logger.warn(
        { target: checksum(ctx.target), data: ctx.rawCalldata, err },
        "Failed to parse CCIP Router despite match()"
      );
      return [];
    }
  },
};
