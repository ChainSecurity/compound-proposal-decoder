export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  137: "Polygon",
  2020: "Ronin",
  8453: "Base",
  42161: "Arbitrum",
  59144: "Linea",
  534352: "Scroll",
  5000: "Mantle",
  130: "Unichain",
};

export const CHAIN_COLORS: Record<number, string> = {
  1: "gray",
  10: "red",
  137: "purple",
  2020: "blue",
  8453: "blue",
  42161: "blue",
  59144: "green",
  534352: "orange",
  5000: "gray",
  130: "purple",
};

export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

export function getChainColor(chainId: number): string {
  return CHAIN_COLORS[chainId] ?? "gray";
}
