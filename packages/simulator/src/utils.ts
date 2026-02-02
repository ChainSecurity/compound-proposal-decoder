import { ethers } from "ethers";

export function zip<T, U>(first: T[], second: U[]): Array<[T, U]> {
  const result: Array<[T, U]> = [];
  for (let i = 0; i < first.length; i++) {
    result.push([first[i], second[i]]);
  }
  return result;
}

/**
 * Extract revert reason from a failed transaction by replaying the call.
 * Returns undefined if the reason cannot be determined.
 */
export async function getRevertReason(
  provider: ethers.JsonRpcProvider,
  txHash: string
): Promise<string | undefined> {
  try {
    const tx = await provider.getTransaction(txHash);
    if (!tx) return undefined;

    // Replay the transaction as a call to get the revert reason
    await provider.call({
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });

    // If call succeeds, no revert reason
    return undefined;
  } catch (err) {
    // Extract revert reason from error
    if (err instanceof Error) {
      // Handle ethers error with revert data
      const error = err as Error & { reason?: string; data?: string; shortMessage?: string };

      // Try to get the reason from various error formats
      if (error.reason) {
        return error.reason;
      }

      if (error.shortMessage) {
        return error.shortMessage;
      }

      // Try to decode revert data if present
      if (error.data && error.data !== "0x") {
        try {
          // Standard Error(string) selector is 0x08c379a0
          if (error.data.startsWith("0x08c379a0")) {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
              ["string"],
              "0x" + error.data.slice(10)
            );
            return decoded[0] as string;
          }
          // Panic(uint256) selector is 0x4e487b71
          if (error.data.startsWith("0x4e487b71")) {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
              ["uint256"],
              "0x" + error.data.slice(10)
            );
            return `Panic(${decoded[0]})`;
          }
          // Return raw revert data for custom errors
          return `Revert data: ${error.data}`;
        } catch {
          return `Revert data: ${error.data}`;
        }
      }

      // Return the error message if nothing else works
      return error.message;
    }
    return undefined;
  }
}
