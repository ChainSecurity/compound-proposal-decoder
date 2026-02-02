import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddress } from "@/lib/evm-proxy-detection/utils";

const EIP_897_INTERFACE = [
  // bytes4(keccak256("implementation()")) padded to 32 bytes
  "0x5c60da1b00000000000000000000000000000000000000000000000000000000",

  // bytes4(keccak256("proxyType()")) padded to 32 bytes
  "0x4555d5c900000000000000000000000000000000000000000000000000000000",
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
          data: EIP_897_INTERFACE[0],
        },
        blockTag,
      ],
    }).then(readAddress);

    let immutable = false;
    try {
      // proxyType === 1 means that the proxy is immutable
      const proxyTypeResult = await jsonRpcRequest({
        method: "eth_call",
        params: [
          {
            to: proxyAddress,
            data: EIP_897_INTERFACE[1],
          },
          blockTag,
        ],
      });
      immutable =
        proxyTypeResult === "0x0000000000000000000000000000000000000000000000000000000000000001";
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      // ignore, proxyType() is optional
    }

    return {
      target,
      type: ProxyType.Eip897 as const,
      immutable,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "EIP-897 DelegateProxy",
  detect,
};
