import { keccak256, getAddress, hexlify, zeroPadValue, toBeHex } from "ethers"; // v6
import { type EIP1193ProviderRequestFunc, type BlockTag } from "@/lib/evm-proxy-detection/types";

/**
 * Converts an ABI-encoded hex string from a JSON-RPC response to a UTF-8 string.
 * @param hex - The ABI-encoded hex string from JSON-RPC response (must include '0x' prefix)
 * @returns The decoded UTF-8 string
 */
export function readString(hex: string): string {
  if (typeof hex !== "string") {
    throw new Error("Input must be a string");
  }
  if (!hex.startsWith("0x")) {
    throw new Error("Hex string must start with 0x");
  }

  // Remove '0x' prefix
  const cleanHex = hex.slice(2);

  // Handle empty response
  if (cleanHex === "") {
    return "";
  }

  // Ensure the hex string has an even length
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }

  // First 32 bytes (64 hex chars) contain the offset to the string data
  const offsetHex = cleanHex.slice(0, 64);
  const offset = parseInt(offsetHex, 16);
  if (isNaN(offset) || offset !== 32) {
    throw new Error("Invalid string offset");
  }

  // Next 32 bytes (64 hex chars) contain the length of the string in bytes
  const lengthHex = cleanHex.slice(64, 128);
  const length = parseInt(lengthHex, 16);
  if (isNaN(length)) {
    throw new Error("Invalid string length");
  }

  // Get the actual string data (padded to multiple of 32 bytes)
  const stringHex = cleanHex.slice(128, 128 + length * 2);

  // Convert hex string to bytes
  const bytes = new Uint8Array(length);
  for (let i = 0; i < stringHex.length; i += 2) {
    const byte = parseInt(stringHex.slice(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new Error("Invalid hex string");
    }
    bytes[i / 2] = byte;
  }

  // Use TextDecoder to convert bytes to string
  return new TextDecoder("utf-8").decode(bytes);
}

const zeroAddress = "0x" + "0".repeat(40);
export const readAddress = (value: unknown) => {
  if (typeof value !== "string" || value === "0x") {
    throw new Error(`Invalid address value: ${value}`);
  }

  let address = value;
  if (address.length > 42) {
    address = "0x" + address.slice(-40);
  }

  if (address.toLowerCase() === zeroAddress) {
    throw new Error("Empty address");
  }

  return getAddress(address) as `0x${string}`;
};

export const readAddressArray = (value: unknown) => {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`Invalid hex-encoded value: ${value}`);
  }

  const hex = value.slice(2);
  if (hex.length < 64) {
    throw new Error("Insufficient data for address[]");
  }

  const offsetBytes = BigInt("0x" + hex.slice(0, 64));
  const offset = Number(offsetBytes) * 2; // hex chars per byte
  if (!Number.isFinite(offset) || offset < 0 || hex.length < offset + 64) {
    throw new Error("Invalid dynamic offset for address[]");
  }

  const length = Number(BigInt("0x" + hex.slice(offset, offset + 64)));
  if (!Number.isFinite(length) || length < 0) {
    throw new Error("Invalid address[] length");
  }

  const addresses: `0x${string}`[] = [];
  let cursor = offset + 64; // start of first element
  const needed = cursor + length * 64;
  if (hex.length < needed) {
    throw new Error("Truncated address[] data");
  }

  for (let i = 0; i < length; i++) {
    const word = hex.slice(cursor, cursor + 64);
    cursor += 64;
    const addressHex = "0x" + word.slice(24);
    if (addressHex !== zeroAddress) {
      addresses.push(addressHex as `0x${string}`);
    }
  }

  if (addresses.length === 0) {
    throw new Error("Empty address[]");
  }

  return addresses;
};

export const readJsonString = (value: unknown) => {
  if (typeof value !== "string") {
    throw new Error(`Invalid hex string value: ${value}`);
  }
  return JSON.parse(readString(value as string));
};

export const pad32 = (v: string) => zeroPadValue(v, 32);

export function mappingSlot(keyAddress: `0x${string}`, slotIndex: number): `0x${string}` {
  const key = pad32(keyAddress);
  const slot = pad32(toBeHex(slotIndex));
  return keccak256(
    hexlify(new Uint8Array([...hexToBytes(key), ...hexToBytes(slot)]))
  ) as `0x${string}`;
}

export function hexToBytes(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: number[] = [];
  for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

export async function getWord(
  req: EIP1193ProviderRequestFunc,
  addr: `0x${string}`,
  slot: `0x${string}`,
  blockTag: BlockTag
) {
  const word = await req({ method: "eth_getStorageAt", params: [addr, slot, blockTag] });
  if (typeof word !== "string" || !word.startsWith("0x") || word.length !== 66)
    throw new Error("bad storage word");
  return word as `0x${string}`;
}

export async function readSolidityString(
  req: EIP1193ProviderRequestFunc,
  proxy: `0x${string}`,
  rootSlot: `0x${string}`,
  blockTag: BlockTag
): Promise<string> {
  const head = await getWord(req, proxy, rootSlot, blockTag);
  const b = hexToBytes(head);
  if (!b[31]) {
    throw new Error("bad head");
  }
  const isLong = (b[31] & 1) === 1;

  if (isLong) {
    // long: head stores len*2+1, data starts at keccak256(rootSlot)
    const dataLen = Number((BigInt(head) - 1n) / 2n);
    if (dataLen > 1024 * 10) {
      // Safety check for huge strings
      throw new Error("String too long");
    }
    const dataRoot = keccak256(rootSlot);
    const words = Math.ceil(dataLen / 32);
    const chunks: number[] = [];
    for (let i = 0; i < words; i++) {
      const slot = toBeHex(BigInt(dataRoot) + BigInt(i));
      const word = await getWord(req, proxy, slot as `0x${string}`, blockTag);
      chunks.push(...hexToBytes(word));
    }
    const str = new TextDecoder().decode(new Uint8Array(chunks.slice(0, dataLen)));
    return str;
  } else {
    // short: last byte is len*2, data is left-aligned in the slot
    if (!b[31]) {
      throw new Error("bad head");
    }
    const len = b[31] >> 1;
    const data = b.slice(0, len);
    const str = new TextDecoder().decode(new Uint8Array(data));
    return str;
  }
}
