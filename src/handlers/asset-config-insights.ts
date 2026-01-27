import { formatUnits } from "ethers";
import { checksum } from "@/utils";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata, type CometAssetMetadata } from "@/lib/comet-metadata";

/**
 * Asset Configuration Insights Handler
 *
 * Compares updateAsset() calls against configuration.json values to highlight
 * differences in collateral factors, supply caps, etc.
 */

const UPDATE_ASSET_SIG = "updateAsset(address,(address,address,uint8,uint64,uint64,uint64,uint128))";
const UPDATE_ASSET_SELECTOR = selectorOfSig(UPDATE_ASSET_SIG);

type AssetConfigTuple = {
  asset: string;
  priceFeed: string;
  decimals: number;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  liquidationFactor: bigint;
  supplyCap: bigint;
};

function parseAssetConfig(args: readonly unknown[]): { cometProxy: string; config: AssetConfigTuple } | null {
  if (!args || args.length < 2) return null;

  const cometProxy = checksum(String(args[0]));
  const configTuple = args[1] as unknown;

  if (!configTuple || typeof configTuple !== "object") return null;

  const cfg = configTuple as Record<string | number, unknown>;

  try {
    return {
      cometProxy,
      config: {
        asset: checksum(String(cfg.asset ?? cfg[0])),
        priceFeed: checksum(String(cfg.priceFeed ?? cfg[1])),
        decimals: Number(cfg.decimals ?? cfg[2] ?? 0),
        borrowCollateralFactor: BigInt(String(cfg.borrowCollateralFactor ?? cfg[3] ?? 0)),
        liquidateCollateralFactor: BigInt(String(cfg.liquidateCollateralFactor ?? cfg[4] ?? 0)),
        liquidationFactor: BigInt(String(cfg.liquidationFactor ?? cfg[5] ?? 0)),
        supplyCap: BigInt(String(cfg.supplyCap ?? cfg[6] ?? 0)),
      },
    };
  } catch (err) {
    logger.debug({ err }, "Failed to parse asset config tuple");
    return null;
  }
}

function formatPercent(value: bigint): string {
  const percent = Number(formatUnits(value, 18)) * 100;
  return `${percent.toFixed(2)}%`;
}

function formatSupplyCap(value: bigint, decimals: number, symbol?: string): string {
  const formatted = formatUnits(value, decimals);
  const num = Number(formatted);
  let display: string;
  if (num >= 1_000_000) {
    display = `${(num / 1_000_000).toFixed(2)}M`;
  } else if (num >= 1_000) {
    display = `${(num / 1_000).toFixed(2)}K`;
  } else {
    display = formatted;
  }
  return symbol ? `${display} ${symbol}` : display;
}

function parseConfigSupplyCap(capStr: string | undefined, decimals: number): bigint | null {
  if (!capStr) return null;
  try {
    // Handle formats like "400000e6" or "3000000e18"
    const normalized = capStr.replace(/_/g, "");
    if (normalized.includes("e")) {
      const [base, exp] = normalized.split("e");
      const expNum = parseInt(exp, 10);
      const baseNum = parseFloat(base);
      return BigInt(Math.round(baseNum * Math.pow(10, expNum)));
    }
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function compareValues(
  label: string,
  proposed: string,
  config: string | undefined,
  isWarning: boolean = false
): { label: string; value: string } {
  if (config === undefined) {
    return { label, value: proposed };
  }
  if (proposed === config) {
    return { label, value: `${proposed} (unchanged)` };
  }
  const warning = isWarning ? " ⚠️" : "";
  return { label, value: `${config} → ${proposed}${warning}` };
}

export const assetConfigInsightsHandler: Handler = {
  name: "Asset Configuration Insights",
  match: (ctx) => {
    if (!ctx.rawCalldata || ctx.rawCalldata.length < 10) return false;
    const selector = ctx.rawCalldata.slice(0, 10);
    return selector === UPDATE_ASSET_SELECTOR;
  },
  expand: async (ctx) => {
    if (!ctx.parsed?.args) return [];

    const parsed = parseAssetConfig(ctx.parsed.args);
    if (!parsed) return [];

    const { cometProxy, config } = parsed;
    const insights: InsightRequest[] = [];

    // Get metadata from configuration.json
    const metadata = getCometMetadata(ctx.chainId, cometProxy);
    const assetMeta = metadata?.assetsByAddress[config.asset];

    const assetSymbol = assetMeta?.symbol ?? "Unknown";
    const assetLabel = assetMeta
      ? `${assetMeta.symbol} (${config.asset})`
      : config.asset;

    const entries: { label: string; value: string }[] = [
      { label: "Asset", value: assetLabel },
    ];

    // Compare collateral factors
    const proposedBorrowCF = formatPercent(config.borrowCollateralFactor);
    const configBorrowCF = assetMeta?.borrowCF !== undefined
      ? `${(assetMeta.borrowCF * 100).toFixed(2)}%`
      : undefined;
    entries.push(compareValues("Borrow CF", proposedBorrowCF, configBorrowCF));

    const proposedLiquidateCF = formatPercent(config.liquidateCollateralFactor);
    const configLiquidateCF = assetMeta?.liquidateCF !== undefined
      ? `${(assetMeta.liquidateCF * 100).toFixed(2)}%`
      : undefined;
    entries.push(compareValues("Liquidate CF", proposedLiquidateCF, configLiquidateCF));

    const proposedLiqFactor = formatPercent(config.liquidationFactor);
    const configLiqFactor = assetMeta?.liquidationFactor !== undefined
      ? `${(assetMeta.liquidationFactor * 100).toFixed(2)}%`
      : undefined;
    entries.push(compareValues("Liquidation Factor", proposedLiqFactor, configLiqFactor));

    // Compare supply cap - this is critical
    const proposedCap = formatSupplyCap(config.supplyCap, config.decimals, assetSymbol);
    const configCapBigInt = parseConfigSupplyCap(assetMeta?.supplyCap, config.decimals);
    const configCap = configCapBigInt !== null
      ? formatSupplyCap(configCapBigInt, config.decimals, assetSymbol)
      : undefined;

    const isZeroCap = config.supplyCap === 0n;
    entries.push(compareValues("Supply Cap", proposedCap, configCap, isZeroCap));

    // Add warning if supply cap is zero
    if (isZeroCap) {
      entries.push({
        label: "⚠️ WARNING",
        value: "Supply cap is ZERO - no deposits allowed for this asset",
      });
    }

    // Price feed
    entries.push({ label: "Price Feed", value: config.priceFeed });

    insights.push(
      insight({
        title: `Asset Config: ${assetSymbol}`,
        entries,
      })
    );

    return insights;
  },
};
