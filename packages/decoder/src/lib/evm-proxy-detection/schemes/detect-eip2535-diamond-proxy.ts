import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddressArray } from "@/lib/evm-proxy-detection/utils";

const EIP_2535_DIAMOND_LOUPE_INTERFACE = [
  // bytes4(keccak256("facetAddresses()")) padded to 32 bytes
  "0x52ef6b2c00000000000000000000000000000000000000000000000000000000",
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
          data: EIP_2535_DIAMOND_LOUPE_INTERFACE[0],
        },
        blockTag,
      ],
    }).then(readAddressArray);
    return {
      target,
      type: ProxyType.Eip2535Diamond as const,
      immutable: false as const,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "EIP-2535 Diamond",
  detect,
};
