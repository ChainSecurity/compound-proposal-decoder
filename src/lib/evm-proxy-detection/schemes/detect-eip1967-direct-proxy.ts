import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddress } from "@/lib/evm-proxy-detection/utils";
import { scheme as addressManagerProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-address-manager-proxy";

// obtained as bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
const EIP_1967_LOGIC_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function detect(
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> {
  try {
    const target = await jsonRpcRequest({
      method: "eth_getStorageAt",
      params: [proxyAddress, EIP_1967_LOGIC_SLOT, blockTag],
    }).then(readAddress);

    return {
      target,
      type: ProxyType.Eip1967Direct as const,
      immutable: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    // fallback to address manager proxy
    return await addressManagerProxyScheme.detect(proxyAddress, jsonRpcRequest, blockTag);
  }
}

export const scheme: DetectionScheme = {
  name: "EIP-1967 direct proxy",
  detect,
};
