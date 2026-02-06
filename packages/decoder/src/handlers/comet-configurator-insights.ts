import { Interface, JsonRpcProvider } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor, getEtherscanTokenInfo, longestSymbol } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata } from "@/lib/comet-metadata";
import { formatRateAsAPY, formatKink, formatSupplyCap, compareValues } from "@/lib/format-utils";
import type { CallInsight, CallInsightEntry } from "@/types";
import { sourced, handlerSource, onChainSource } from "@/types/sources";

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

const HANDLER_NAME = "comet-configurator-insights";

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
    const trackSources = ctx.options?.trackSources ?? false;

    // Helper to create an insight with optional source tracking
    const createInsight = (title: string, entries: CallInsightEntry[]): CallInsight => {
      const ins: CallInsight = { title, entries };
      if (trackSources) {
        ins._handlerSource = handlerSource(HANDLER_NAME, `Reads on-chain configuration from ${configuratorProxy}`);
      }
      return ins;
    };

    // Helper to wrap a value with on-chain source if tracking
    const withOnChainSource = (
      value: string,
      target: string,
      method: string,
      params: unknown[]
    ): string | ReturnType<typeof sourced<string>> => {
      if (!trackSources) return value;
      return sourced(value, onChainSource(ctx.chainId, target, method, params));
    };

    if (selector === UPDATE_ASSET_SUPPLY_CAP_SELECTOR) {
      const [cometProxyArg, assetArg, newCapArg] = ctx.parsed.args ?? [];
      if (!cometProxyArg || !assetArg || newCapArg === undefined) return insights;
      const cometProxy = checksum(String(cometProxyArg));
      const asset = checksum(String(assetArg));
      const newCap = typeof newCapArg === "bigint" ? newCapArg : BigInt(String(newCapArg));

      const metadata = getCometMetadata(ctx.chainId, cometProxy);
      const assetMeta = metadata?.assetsByAddress[asset];
      const assetSymbol = assetMeta?.symbol;

      const entries: CallInsightEntry[] = [
        {
          label: "Comet",
          value: await formatCometLabel(ctx.chainId, cometProxy),
        },
        {
          label: "Asset",
          value: await formatAssetLabel(ctx.chainId, cometProxy, asset),
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
              const comparedValue = compareValues(currentCapFormatted, newCapFormatted);
              entries.push({
                label: "Supply Cap",
                value: withOnChainSource(comparedValue, configuratorProxy, CONFIG_GETTER, [cometProxy]),
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

      insights.push(insight(createInsight("Supply Cap Update", entries)));
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

      const entries: CallInsightEntry[] = [
        {
          label: "Comet",
          value: await formatCometLabel(ctx.chainId, cometProxy),
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
            const comparedValue = compareValues(currentFormatted, newValueFormatted);
            entries.push({
              label: rateInfo.isKink ? "Kink" : "Rate",
              value: withOnChainSource(comparedValue, configuratorProxy, CONFIG_GETTER, [cometProxy]),
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

      insights.push(insight(createInsight(rateInfo.title, entries)));
    }

    return insights;
  },
};

const ERC20_INFO_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const COMET_BASE_TOKEN_ABI = ["function baseToken() view returns (address)"];

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenTag(symbol: string | null, decimals: number | null): string | null {
  if (!symbol) return null;
  const dec = decimals !== null ? ` (${decimals} dec.)` : "";
  return `${symbol}${dec}`;
}

async function fetchTokenInfo(chainId: number, address: string, staticSymbol?: string | null): Promise<{ symbol: string | null; decimals: number | null }> {
  // Try explorer page for precise ticker (e.g. "USDC.e" not "USDC")
  const explorerToken = await getEtherscanTokenInfo(address, chainId);
  const bestStatic = explorerToken.symbol ?? staticSymbol ?? null;

  try {
    const provider = getProviderFor(chainId);
    const iface = new Interface(ERC20_INFO_ABI);
    const [symRes, decRes] = await Promise.allSettled([
      provider.call({ to: address, data: iface.encodeFunctionData("symbol") }),
      provider.call({ to: address, data: iface.encodeFunctionData("decimals") }),
    ]);
    const onChainSymbol = symRes.status === "fulfilled"
      ? (iface.decodeFunctionResult("symbol", symRes.value)[0] as string)
      : null;
    const decimals = decRes.status === "fulfilled"
      ? Number(iface.decodeFunctionResult("decimals", decRes.value)[0])
      : null;
    // Pick the longest symbol (longer ≈ more informative, e.g. "USDC.e" > "USDC")
    const symbol = longestSymbol(bestStatic, onChainSymbol);
    return { symbol, decimals };
  } catch {
    return { symbol: bestStatic, decimals: null };
  }
}

async function fetchBaseTokenTag(chainId: number, cometProxy: string): Promise<string | null> {
  try {
    const provider = getProviderFor(chainId);
    const iface = new Interface(COMET_BASE_TOKEN_ABI);
    const result = await provider.call({ to: cometProxy, data: iface.encodeFunctionData("baseToken") });
    const [baseTokenAddr] = iface.decodeFunctionResult("baseToken", result);
    if (!baseTokenAddr || typeof baseTokenAddr !== "string") return null;
    const { symbol, decimals } = await fetchTokenInfo(chainId, baseTokenAddr);
    return formatTokenTag(symbol, decimals);
  } catch {
    return null;
  }
}

async function formatCometLabel(chainId: number, comet: string): Promise<string> {
  const metadata = getCometMetadata(chainId, comet);
  if (metadata) {
    const label = metadata.name ? `${metadata.name} (${metadata.symbol})` : metadata.symbol;
    let baseTag: string | null = null;
    if (metadata.baseTokenAddress) {
      const { symbol, decimals } = await fetchTokenInfo(chainId, metadata.baseTokenAddress, metadata.baseTokenSymbol);
      baseTag = formatTokenTag(symbol, decimals);
    } else if (metadata.baseTokenSymbol) {
      baseTag = metadata.baseTokenSymbol;
    }
    const basePart = baseTag ? ` • base: ${baseTag}` : "";
    return `${label}${basePart} • ${shortAddr(comet)}`;
  }
  const { symbol, decimals } = await fetchTokenInfo(chainId, comet);
  const cometTag = formatTokenTag(symbol, decimals) ?? shortAddr(comet);
  const baseTag = await fetchBaseTokenTag(chainId, comet);
  const basePart = baseTag ? ` • base: ${baseTag}` : "";
  return `${cometTag}${basePart} • ${shortAddr(comet)}`;
}

async function formatAssetLabel(chainId: number, comet: string, asset: string): Promise<string> {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) {
    const { symbol, decimals } = await fetchTokenInfo(chainId, asset);
    const tag = formatTokenTag(symbol, decimals);
    return tag ? `${tag} • ${shortAddr(asset)}` : shortAddr(asset);
  }
  const assetMeta = metadata.assetsByAddress[checksum(asset)];
  if (!assetMeta) {
    const { symbol, decimals } = await fetchTokenInfo(chainId, asset);
    const tag = formatTokenTag(symbol, decimals);
    return tag ? `${tag} • ${shortAddr(asset)}` : shortAddr(asset);
  }
  // Override static metadata symbol with precise explorer ticker
  const explorerToken = await getEtherscanTokenInfo(asset, chainId);
  const symbol = explorerToken.symbol ?? assetMeta.symbol;
  const dec = assetMeta.decimals !== undefined ? ` (${assetMeta.decimals} dec.)` : "";
  return `${symbol}${dec} • ${shortAddr(assetMeta.address)}`;
}

function lookupAssetDecimals(chainId: number, comet: string, asset: string): number | undefined {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) return undefined;
  return metadata.assetsByAddress[checksum(asset)]?.decimals;
}
