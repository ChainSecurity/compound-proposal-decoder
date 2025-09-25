import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddress } from "@/lib/evm-proxy-detection/utils";

const COMPTROLLER_PROXY_INTERFACE = [
  // bytes4(keccak256("comptrollerImplementation()")) padded to 32 bytes
  "0xbb82aa5e00000000000000000000000000000000000000000000000000000000",
];

async function detect(
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> {
  try {
    const target = await jsonRpcRequest({
      method: "eth_call",
      params: [
        {
          to: proxyAddress,
          data: COMPTROLLER_PROXY_INTERFACE[0],
        },
        blockTag,
      ],
    }).then(readAddress);
    return {
      target,
      type: ProxyType.Comptroller as const,
      immutable: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "Comptroller",
  detect,
};
