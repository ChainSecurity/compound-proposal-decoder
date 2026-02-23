/**
 * Chain ID → block explorer base URL mapping.
 */
const EXPLORER_BASE_URLS: Record<number, string> = {
  1: "https://etherscan.io",
  10: "https://optimistic.etherscan.io",
  137: "https://polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
  59144: "https://lineascan.build",
  534352: "https://scrollscan.com",
  5000: "https://mantlescan.xyz",
  130: "https://unichain.blockscout.com",
  2020: "https://app.roninchain.com",
};

/**
 * Returns a block explorer transaction URL for the given chain and tx hash,
 * or undefined if the chain has no known explorer.
 */
export function getTxExplorerUrl(chainId: number, txHash: string): string | undefined {
  const base = EXPLORER_BASE_URLS[chainId];
  if (!base) return undefined;
  return `${base}/tx/${txHash}`;
}
