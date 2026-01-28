export function formatAddress(address: string): string {
  let cleanAddress = address.startsWith("0x") ? address.substring(2) : address;
  const desiredLength = 32 * 2; // 32 bytes = 64 hex characters

  if (cleanAddress.length >= desiredLength) {
    return "0x" + cleanAddress;
  }

  const zerosToPrepend = desiredLength - cleanAddress.length;
  const paddedAddress = "0".repeat(zerosToPrepend) + cleanAddress;

  return "0x" + paddedAddress;
}
