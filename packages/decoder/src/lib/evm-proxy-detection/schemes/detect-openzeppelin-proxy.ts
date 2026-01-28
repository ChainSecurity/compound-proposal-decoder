import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddress } from "@/lib/evm-proxy-detection/utils";

// obtained as keccak256("org.zeppelinos.proxy.implementation")
const OPEN_ZEPPELIN_IMPLEMENTATION_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";

async function detect(
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> {
  try {
    const target = await jsonRpcRequest({
      method: "eth_getStorageAt",
      params: [proxyAddress, OPEN_ZEPPELIN_IMPLEMENTATION_SLOT, blockTag],
    }).then(readAddress);
    return {
      target,
      type: ProxyType.OpenZeppelin as const,
      immutable: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "OpenZeppelin proxy",
  detect,
};
