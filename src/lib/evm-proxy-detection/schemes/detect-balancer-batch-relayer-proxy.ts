import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddress, readJsonString } from "@/lib/evm-proxy-detection/utils";

const BATCH_RELAYER_INTERFACE = [
  // bytes4(keccak256("version()")) padded to 32 bytes
  "0x54fd4d5000000000000000000000000000000000000000000000000000000000",
  // bytes4(keccak256("getLibrary()")) padded to 32 bytes
  "0x7678922e00000000000000000000000000000000000000000000000000000000",
];

async function detect(
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> {
  try {
    const json = await jsonRpcRequest({
      method: "eth_call",
      params: [{ to: proxyAddress, data: BATCH_RELAYER_INTERFACE[0] }, blockTag],
    }).then(readJsonString);

    if (json.name !== "BatchRelayer") {
      throw new Error("Not a BatchRelayer");
    }

    const target = await jsonRpcRequest({
      method: "eth_call",
      params: [{ to: proxyAddress, data: BATCH_RELAYER_INTERFACE[1] }, blockTag],
    }).then(readAddress);

    return {
      target,
      type: ProxyType.BatchRelayer as const,
      immutable: true,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "Balancer BatchRelayer",
  detect,
};
