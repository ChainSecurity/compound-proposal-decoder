import { hexlify, toBeHex } from "ethers"; // v6
import { type EIP1193ProviderRequestFunc, type BlockTag, type Result, ProxyType, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { mappingSlot, readSolidityString, readAddress } from "@/lib/evm-proxy-detection/utils";

// selector for AddressManager.getAddress(string)
const GET_ADDRESS_SELECTOR = "0xbf40fac1"; // keccak256("getAddress(string)")[:4]

// abi-encode a single string for eth_call (selector + offset + length + padded bytes)
function encodeGetAddressCall(name: string): `0x${string}` {
  // minimal abi encoding without external libs
  const encStr = new TextEncoder().encode(name);
  const len = encStr.length;
  const paddedLen = Math.ceil(len / 32) * 32;
  const head = toBeHex(32, 32); // offset 0x20
  const lenWord = toBeHex(len, 32);
  const dataPadded = hexlify(new Uint8Array([...encStr, ...new Array(paddedLen - len).fill(0)]));
  return (GET_ADDRESS_SELECTOR +
    head.slice(2) +
    lenWord.slice(2) +
    dataPadded.slice(2)) as `0x${string}`;
}

async function detect(
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> {
  try {
    // slots keyed by address(this)
    const key0 = mappingSlot(proxyAddress, 0);
    const key1 = mappingSlot(proxyAddress, 1);

    // AddressManager address
    const amWord = await jsonRpcRequest({
      method: "eth_getStorageAt",
      params: [proxyAddress, key1, blockTag],
    });
    if (BigInt(amWord as string) === 0n) {
      return null;
    }
    const addressManager = readAddress(amWord);

    // implementationName string
    const implName = await readSolidityString(
      jsonRpcRequest,
      proxyAddress,
      key0 as `0x${string}`,
      blockTag
    );

    // resolve via AddressManager.getAddress(name)
    const data = encodeGetAddressCall(implName);
    const out = (await jsonRpcRequest({
      method: "eth_call",
      params: [{ to: addressManager, data }, blockTag],
    })) as string;

    const target = readAddress(out);

    return {
      target,
      type: ProxyType.AddressManager,
      immutable: false,
      // optionally include metadata if your Result supports it
      // meta: { addressManager, implementationName: implName }
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_err) {
    return null;
  }
}

export const scheme: DetectionScheme = {
  name: "AddressManager proxy",
  detect,
};
