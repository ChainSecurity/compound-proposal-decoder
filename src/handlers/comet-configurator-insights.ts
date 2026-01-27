import { Interface, JsonRpcProvider } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata } from "@/lib/comet-metadata";
import { formatRateAsAPY, formatKink, formatSupplyCap, compareValues } from "@/lib/format-utils";

const UPDATE_ASSET_SUPPLY_CAP_SIG = "updateAssetSupplyCap(address,address,uint128)";
const UPDATE_ASSET_SUPPLY_CAP_SELECTOR = selectorOfSig(UPDATE_ASSET_SUPPLY_CAP_SIG);

const SET_BORROW_SLOPE_LOW_SIG = "setBorrowPerYearInterestRateSlopeLow(address,uint64)";
const SET_BORROW_SLOPE_LOW_SELECTOR = selectorOfSig(SET_BORROW_SLOPE_LOW_SIG);

const SET_BORROW_SLOPE_HIGH_SIG = "setBorrowPerYearInterestRateSlopeHigh(address,uint64)";
const SET_BORROW_SLOPE_HIGH_SELECTOR = selectorOfSig(SET_BORROW_SLOPE_HIGH_SIG);

const SET_BORROW_BASE_SIG = "setBorrowPerYearInterestRateBase(address,uint64)";
const SET_BORROW_BASE_SELECTOR = selectorOfSig(SET_BORROW_BASE_SIG);

const SET_SUPPLY_SLOPE_LOW_SIG = "setSupplyPerYearInterestRateSlopeLow(address,uint64)";
const SET_SUPPLY_SLOPE_LOW_SELECTOR = selectorOfSig(SET_SUPPLY_SLOPE_LOW_SIG);

const SET_SUPPLY_SLOPE_HIGH_SIG = "setSupplyPerYearInterestRateSlopeHigh(address,uint64)";
const SET_SUPPLY_SLOPE_HIGH_SELECTOR = selectorOfSig(SET_SUPPLY_SLOPE_HIGH_SIG);

const SET_SUPPLY_BASE_SIG = "setSupplyPerYearInterestRateBase(address,uint64)";
const SET_SUPPLY_BASE_SELECTOR = selectorOfSig(SET_SUPPLY_BASE_SIG);

const SET_BORROW_KINK_SIG = "setBorrowKink(address,uint64)";
const SET_BORROW_KINK_SELECTOR = selectorOfSig(SET_BORROW_KINK_SIG);

const SET_SUPPLY_KINK_SIG = "setSupplyKink(address,uint64)";
const SET_SUPPLY_KINK_SELECTOR = selectorOfSig(SET_SUPPLY_KINK_SIG);

// All rate/kink selectors for matching
const RATE_SELECTORS = [
  SET_BORROW_SLOPE_LOW_SELECTOR,
  SET_BORROW_SLOPE_HIGH_SELECTOR,
  SET_BORROW_BASE_SELECTOR,
  SET_SUPPLY_SLOPE_LOW_SELECTOR,
  SET_SUPPLY_SLOPE_HIGH_SELECTOR,
  SET_SUPPLY_BASE_SELECTOR,
  SET_BORROW_KINK_SELECTOR,
  SET_SUPPLY_KINK_SELECTOR,
];

const CONFIG_GETTER = "getConfiguration(address)";

function getProviderSafe(chainId: number): JsonRpcProvider | null {
  try {
    return getProviderFor(chainId);
  } catch (err) {
    logger.debug({ chainId, err }, "Configurator insights skipped: missing provider");
    return null;
  }
}

async function getConfiguratorInterface(
  chainId: number,
  configuratorProxy: string,
  provider: JsonRpcProvider
): Promise<Interface | null> {
  try {
    const implementation =
      (await getImplementationAddress(provider, configuratorProxy)) ?? configuratorProxy;
    return (await getAbiFor(implementation, chainId)) ?? null;
  } catch (err) {
    logger.debug({ chainId, configuratorProxy, err }, "Failed to load configurator ABI");
    return null;
  }
}

async function getConfiguration(
  iface: Interface,
  provider: JsonRpcProvider,
  configuratorProxy: string,
  cometProxy: string
): Promise<Configuration | null> {
  try {
    if (!iface.getFunction(CONFIG_GETTER)) return null;
    const data = iface.encodeFunctionData(CONFIG_GETTER, [cometProxy]);
    const raw = await provider.call({ to: configuratorProxy, data });
    const decoded = iface.decodeFunctionResult(CONFIG_GETTER, raw);
    if (!Array.isArray(decoded) || decoded.length === 0) return null;
    const cfg = decoded[0] as unknown;
    return normalizeConfiguration(cfg);
  } catch (err) {
    logger.debug({ configuratorProxy, cometProxy, err }, "Failed to read configurator configuration");
    return null;
  }
}

type AssetConfig = {
  asset: string;
  priceFeed: string;
  decimals: number;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  liquidationFactor: bigint;
  supplyCap: bigint;
};

type Configuration = {
  supplyKink: bigint;
  supplyPerYearInterestRateSlopeLow: bigint;
  supplyPerYearInterestRateSlopeHigh: bigint;
  supplyPerYearInterestRateBase: bigint;
  borrowKink: bigint;
  borrowPerYearInterestRateSlopeLow: bigint;
  borrowPerYearInterestRateSlopeHigh: bigint;
  borrowPerYearInterestRateBase: bigint;
  storeFrontPriceFactor: bigint;
  trackingIndexScale: bigint;
  baseTrackingSupplySpeed: bigint;
  baseTrackingBorrowSpeed: bigint;
  baseMinForRewards: bigint;
  baseBorrowMin: bigint;
  targetReserves: bigint;
  assetConfigs: AssetConfig[];
};

function normalizeConfiguration(value: unknown): Configuration | null {
  if (!value || typeof value !== "object") return null;
  const cfg = value as Record<string | number, unknown>;
  const assetConfigsRaw = (cfg.assetConfigs ?? cfg["assetConfigs"] ?? []) as unknown;
  const assetConfigs: AssetConfig[] = Array.isArray(assetConfigsRaw)
    ? assetConfigsRaw
        .map((entry) => normalizeAssetConfig(entry))
        .filter((entry): entry is AssetConfig => entry !== null)
    : [];

  return {
    supplyKink: getBigInt(cfg, "supplyKink", 5),
    supplyPerYearInterestRateSlopeLow: getBigInt(cfg, "supplyPerYearInterestRateSlopeLow", 6),
    supplyPerYearInterestRateSlopeHigh: getBigInt(cfg, "supplyPerYearInterestRateSlopeHigh", 7),
    supplyPerYearInterestRateBase: getBigInt(cfg, "supplyPerYearInterestRateBase", 8),
    borrowKink: getBigInt(cfg, "borrowKink", 9),
    borrowPerYearInterestRateSlopeLow: getBigInt(cfg, "borrowPerYearInterestRateSlopeLow", 10),
    borrowPerYearInterestRateSlopeHigh: getBigInt(cfg, "borrowPerYearInterestRateSlopeHigh", 11),
    borrowPerYearInterestRateBase: getBigInt(cfg, "borrowPerYearInterestRateBase", 12),
    storeFrontPriceFactor: getBigInt(cfg, "storeFrontPriceFactor", 13),
    trackingIndexScale: getBigInt(cfg, "trackingIndexScale", 14),
    baseTrackingSupplySpeed: getBigInt(cfg, "baseTrackingSupplySpeed", 15),
    baseTrackingBorrowSpeed: getBigInt(cfg, "baseTrackingBorrowSpeed", 16),
    baseMinForRewards: getBigInt(cfg, "baseMinForRewards", 17),
    baseBorrowMin: getBigInt(cfg, "baseBorrowMin", 18),
    targetReserves: getBigInt(cfg, "targetReserves", 19),
    assetConfigs,
  };
}

function normalizeAssetConfig(value: unknown): AssetConfig | null {
  if (!value || typeof value !== "object") return null;
  const cfg = value as Record<string | number, unknown>;
  try {
    const asset = checksum(String(cfg.asset ?? cfg[0]));
    const priceFeed = checksum(String(cfg.priceFeed ?? cfg[1] ?? "0x0000000000000000000000000000000000000000"));
    const decimals = Number(cfg.decimals ?? cfg[2] ?? 0);
    const borrowCF = getBigInt(cfg, "borrowCollateralFactor", 3);
    const liquidateCF = getBigInt(cfg, "liquidateCollateralFactor", 4);
    const liquidationFactor = getBigInt(cfg, "liquidationFactor", 5);
    const supplyCap = getBigInt(cfg, "supplyCap", 6, true);
    return {
      asset,
      priceFeed,
      decimals,
      borrowCollateralFactor: borrowCF,
      liquidateCollateralFactor: liquidateCF,
      liquidationFactor,
      supplyCap,
    };
  } catch (err) {
    logger.debug({ err }, "Failed to normalise asset config");
    return null;
  }
}

function getBigInt(
  source: Record<string | number, unknown>,
  key: string,
  index: number,
  allowZero = false
): bigint {
  const val = source[key] ?? source[index] ?? (allowZero ? 0n : undefined);
  if (typeof val === "bigint") return val;
  if (typeof val === "number") return BigInt(val);
  if (typeof val === "string" && val.length) {
    return BigInt(val);
  }
  return 0n;
}

function inferDecimalsFromAssetConfig(asset: AssetConfig): number {
  const decimals = asset.decimals;
  if (Number.isFinite(decimals) && decimals >= 0 && decimals <= 36) {
    return decimals;
  }
  // fallback: attempt to deduce from supply cap magnitude
  const cap = asset.supplyCap;
  const capStr = cap.toString();
  const zeros = capStr.length - capStr.replace(/0+$/, "").length;
  return Math.min(Math.max(0, zeros), 36);
}

type RateUpdateInfo = {
  selector: string;
  title: string;
  configKey: keyof Configuration;
  isKink: boolean;
};

const RATE_UPDATE_INFO: Record<string, RateUpdateInfo> = {
  [SET_BORROW_SLOPE_LOW_SELECTOR]: {
    selector: SET_BORROW_SLOPE_LOW_SELECTOR,
    title: "Borrow Slope Low Update",
    configKey: "borrowPerYearInterestRateSlopeLow",
    isKink: false,
  },
  [SET_BORROW_SLOPE_HIGH_SELECTOR]: {
    selector: SET_BORROW_SLOPE_HIGH_SELECTOR,
    title: "Borrow Slope High Update",
    configKey: "borrowPerYearInterestRateSlopeHigh",
    isKink: false,
  },
  [SET_BORROW_BASE_SELECTOR]: {
    selector: SET_BORROW_BASE_SELECTOR,
    title: "Borrow Base Rate Update",
    configKey: "borrowPerYearInterestRateBase",
    isKink: false,
  },
  [SET_SUPPLY_SLOPE_LOW_SELECTOR]: {
    selector: SET_SUPPLY_SLOPE_LOW_SELECTOR,
    title: "Supply Slope Low Update",
    configKey: "supplyPerYearInterestRateSlopeLow",
    isKink: false,
  },
  [SET_SUPPLY_SLOPE_HIGH_SELECTOR]: {
    selector: SET_SUPPLY_SLOPE_HIGH_SELECTOR,
    title: "Supply Slope High Update",
    configKey: "supplyPerYearInterestRateSlopeHigh",
    isKink: false,
  },
  [SET_SUPPLY_BASE_SELECTOR]: {
    selector: SET_SUPPLY_BASE_SELECTOR,
    title: "Supply Base Rate Update",
    configKey: "supplyPerYearInterestRateBase",
    isKink: false,
  },
  [SET_BORROW_KINK_SELECTOR]: {
    selector: SET_BORROW_KINK_SELECTOR,
    title: "Borrow Kink Update",
    configKey: "borrowKink",
    isKink: true,
  },
  [SET_SUPPLY_KINK_SELECTOR]: {
    selector: SET_SUPPLY_KINK_SELECTOR,
    title: "Supply Kink Update",
    configKey: "supplyKink",
    isKink: true,
  },
};

export const cometConfiguratorInsightsHandler: Handler = {
  name: "Configurator storage insights",
  match: (ctx) => {
    if (!ctx.rawCalldata || ctx.rawCalldata.length < 10) return false;
    const selector = ctx.rawCalldata.slice(0, 10);
    return selector === UPDATE_ASSET_SUPPLY_CAP_SELECTOR || RATE_SELECTORS.includes(selector);
  },
  expand: async (ctx) => {
    const selector = ctx.rawCalldata.slice(0, 10);
    if (!ctx.parsed) return [];

    const configuratorProxy = checksum(ctx.target);
    const insights: InsightRequest[] = [];

    if (selector === UPDATE_ASSET_SUPPLY_CAP_SELECTOR) {
      const [cometProxyArg, assetArg, newCapArg] = ctx.parsed.args ?? [];
      if (!cometProxyArg || !assetArg || newCapArg === undefined) return insights;
      const cometProxy = checksum(String(cometProxyArg));
      const asset = checksum(String(assetArg));
      const newCap = typeof newCapArg === "bigint" ? newCapArg : BigInt(String(newCapArg));

      const metadata = getCometMetadata(ctx.chainId, cometProxy);
      const assetMeta = metadata?.assetsByAddress[asset];
      const assetSymbol = assetMeta?.symbol;

      const entries: { label: string; value: string }[] = [
        {
          label: "Comet",
          value: formatCometLabel(ctx.chainId, cometProxy),
        },
        {
          label: "Asset",
          value: formatAssetLabel(ctx.chainId, cometProxy, asset),
        },
      ];

      const provider = getProviderSafe(ctx.chainId);
      if (provider) {
        const iface = await getConfiguratorInterface(ctx.chainId, configuratorProxy, provider);
        if (iface) {
          const config = await getConfiguration(iface, provider, configuratorProxy, cometProxy);
          if (config) {
            const assetConfig = config.assetConfigs.find((cfg) => cfg.asset === asset);
            if (assetConfig) {
              const decimals = inferDecimalsFromAssetConfig(assetConfig);
              const currentCapFormatted = formatSupplyCap(assetConfig.supplyCap, decimals, assetSymbol);
              const newCapFormatted = formatSupplyCap(newCap, decimals, assetSymbol);
              entries.push({
                label: "Supply Cap",
                value: compareValues(currentCapFormatted, newCapFormatted),
              });
            }
          }
        } else {
          entries.push({ label: "Status", value: "Configurator ABI missing" });
        }
      } else {
        const decimals = lookupAssetDecimals(ctx.chainId, cometProxy, asset);
        if (decimals !== undefined) {
          entries.push({
            label: "New Supply Cap",
            value: formatSupplyCap(newCap, decimals, assetSymbol),
          });
        } else {
          entries.push({ label: "New Supply Cap", value: newCap.toString() });
        }
        entries.push({ label: "Status", value: "Configure RPC to fetch current cap" });
      }

      insights.push(
        insight({
          title: "Supply Cap Update",
          entries,
        })
      );
    }

    // Handle all rate/kink updates
    const rateInfo = RATE_UPDATE_INFO[selector];
    if (rateInfo) {
      const [cometProxyArg, newValueArg] = ctx.parsed.args ?? [];
      if (!cometProxyArg || newValueArg === undefined) return insights;
      const cometProxy = checksum(String(cometProxyArg));
      const newValue = typeof newValueArg === "bigint" ? newValueArg : BigInt(String(newValueArg));

      const formatValue = rateInfo.isKink ? formatKink : formatRateAsAPY;
      const newValueFormatted = formatValue(newValue);

      const entries: { label: string; value: string }[] = [
        {
          label: "Comet",
          value: formatCometLabel(ctx.chainId, cometProxy),
        },
      ];

      const provider = getProviderSafe(ctx.chainId);
      if (provider) {
        const iface = await getConfiguratorInterface(ctx.chainId, configuratorProxy, provider);
        if (iface) {
          const config = await getConfiguration(iface, provider, configuratorProxy, cometProxy);
          if (config) {
            const currentValue = config[rateInfo.configKey] as bigint;
            const currentFormatted = formatValue(currentValue);
            entries.push({
              label: rateInfo.isKink ? "Kink" : "Rate",
              value: compareValues(currentFormatted, newValueFormatted),
            });
          } else {
            entries.push({
              label: rateInfo.isKink ? "New Kink" : "New Rate",
              value: newValueFormatted,
            });
          }
        } else {
          entries.push({ label: "Status", value: "Configurator ABI missing" });
          entries.push({
            label: rateInfo.isKink ? "New Kink" : "New Rate",
            value: newValueFormatted,
          });
        }
      } else {
        entries.push({
          label: rateInfo.isKink ? "New Kink" : "New Rate",
          value: newValueFormatted,
        });
        entries.push({ label: "Status", value: "Configure RPC to fetch current value" });
      }

      insights.push(
        insight({
          title: rateInfo.title,
          entries,
        })
      );
    }

    return insights;
  },
};

function formatCometLabel(chainId: number, comet: string): string {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) return comet;
  const label = metadata.name ? `${metadata.name} (${metadata.symbol})` : metadata.symbol;
  return `${label} • ${comet}`;
}

function formatAssetLabel(chainId: number, comet: string, asset: string): string {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) return asset;
  const assetMeta = metadata.assetsByAddress[checksum(asset)];
  if (!assetMeta) return asset;
  return `${assetMeta.symbol}${assetMeta.name ? ` (${assetMeta.name})` : ""} • ${assetMeta.address}`;
}

function lookupAssetDecimals(chainId: number, comet: string, asset: string): number | undefined {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) return undefined;
  return metadata.assetsByAddress[checksum(asset)]?.decimals;
}
