import { type BlockTag, type EIP1193ProviderRequestFunc, ProxyType, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { readAddress } from "@/lib/evm-proxy-detection/utils";

// obtained as bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)
const EIP_1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

const EIP_1967_BEACON_METHODS = [
  // bytes4(keccak256("implementation()")) padded to 32 bytes
  "0x5c60da1b00000000000000000000000000000000000000000000000000000000",
  // bytes4(keccak256("childImplementation()")) padded to 32 bytes
  // some implementations use this over the standard method name so that the beacon contract is not detected as an EIP-897 proxy itself
  "0xda52571600000000000000000000000000000000000000000000000000000000",
];

async function detect(
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> {
  try {
    const beaconAddress = await jsonRpcRequest({
      method: "eth_getStorageAt",
      params: [proxyAddress, EIP_1967_BEACON_SLOT, blockTag],
    }).then(readAddress);

    const target = await jsonRpcRequest({
      method: "eth_call",
      params: [
        {
          to: beaconAddress,
          data: EIP_1967_BEACON_METHODS[0],
        },
        blockTag,
      ],
    })
      .catch(() =>
        jsonRpcRequest({
          method: "eth_call",
          params: [
            {
              to: beaconAddress,
              data: EIP_1967_BEACON_METHODS[1],
            },
            blockTag,
          ],
        })
      )
      .then(readAddress);

    return {
      target,
      type: ProxyType.Eip1967Beacon as const,
      immutable: false,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "EIP-1967 beacon proxy",
  detect,
};
