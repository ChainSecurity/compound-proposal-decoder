interface TokenIconProps {
  symbol: string;
  className?: string;
}

// Common token colors
const tokenColors: Record<string, string> = {
  ETH: "#627EEA",
  WETH: "#627EEA",
  USDC: "#2775CA",
  USDT: "#26A17B",
  DAI: "#F5AC37",
  COMP: "#00D395",
  WBTC: "#F7931A",
  UNI: "#FF007A",
  LINK: "#2A5ADA",
  AAVE: "#B6509E",
  CRV: "#FF4C4C",
  MKR: "#1AAB9B",
  cbETH: "#0052FF",
  wstETH: "#00A3FF",
  rETH: "#F59858",
};

export function TokenIcon({ symbol, className = "w-4 h-4" }: TokenIconProps) {
  const upperSymbol = symbol.toUpperCase();
  const color = tokenColors[upperSymbol] ?? "#6B7280";

  // First letter of the token
  const letter = symbol.charAt(0).toUpperCase();

  return (
    <div
      className={`${className} rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0`}
      style={{ backgroundColor: color }}
      title={symbol}
    >
      {letter}
    </div>
  );
}

// Check if a symbol is a known token
export function isKnownToken(symbol: string): boolean {
  return symbol.toUpperCase() in tokenColors;
}
