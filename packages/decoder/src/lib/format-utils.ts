import { formatUnits } from "ethers";

/**
 * Shared formatting utilities for proposal decoder insights.
 */

/**
 * Convert 18-decimal per-year rate to APY percentage.
 * Rates in Compound are stored as per-second values scaled by 1e18.
 */
export function formatRateAsAPY(value: bigint): string {
  const decimal = Number(formatUnits(value, 18));
  const percentage = decimal * 100;
  return `${percentage.toFixed(2)}%`;
}

/**
 * Format kink (utilization threshold) as percentage.
 * Kink values are 18-decimal representing utilization (0.8 = 80%).
 */
export function formatKink(value: bigint): string {
  const decimal = Number(formatUnits(value, 18));
  return `${(decimal * 100).toFixed(0)}% utilization`;
}

/**
 * Format supply cap with K/M abbreviations and optional symbol.
 */
export function formatSupplyCap(value: bigint, decimals: number, symbol?: string): string {
  const formatted = formatUnits(value, decimals);
  const num = Number(formatted);
  let display: string;
  if (num >= 1_000_000) {
    display = `${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    display = `${(num / 1_000).toFixed(2)}K`;
  } else {
    display = num.toFixed(2);
  }
  return symbol ? `${display} ${symbol}` : display;
}

/**
 * Format a collateral factor or similar 18-decimal percentage value.
 */
export function formatPercent(value: bigint): string {
  const percent = Number(formatUnits(value, 18)) * 100;
  return `${percent.toFixed(2)}%`;
}

/**
 * Compare current vs proposed values with arrow format.
 * Returns "current → proposed" or just "proposed (unchanged)" if equal.
 */
export function compareValues(current: string, proposed: string, warn?: boolean): string {
  if (current === proposed) {
    return `${proposed} (unchanged)`;
  }
  const warning = warn ? " ⚠️" : "";
  return `${current} → ${proposed}${warning}`;
}

/**
 * Format a USD price with thousands separators.
 */
export function formatUSDPrice(value: bigint, decimals: number): string {
  const num = Number(formatUnits(value, decimals));
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a price denominated in a base asset (e.g., ETH, not USD).
 * Uses appropriate decimal places based on magnitude.
 */
export function formatAssetDenominatedPrice(value: bigint, decimals: number, baseAssetSymbol?: string): string {
  const num = Number(formatUnits(value, decimals));
  let formatted: string;

  if (num === 0) {
    formatted = "0";
  } else if (num < 0.0001) {
    formatted = num.toExponential(4);
  } else if (num < 1) {
    formatted = num.toFixed(6);
  } else if (num < 1000) {
    formatted = num.toFixed(4);
  } else {
    formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return baseAssetSymbol ? `${formatted} ${baseAssetSymbol}` : formatted;
}
