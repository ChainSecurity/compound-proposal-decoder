import { Interface, JsonRpcProvider } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata } from "@/lib/comet-metadata";
import { formatUSDPrice, formatAssetDenominatedPrice } from "@/lib/format-utils";
import type { CallInsight } from "@/types";
import { handlerSource } from "@/types/sources";

const HANDLER_NAME = "comet-configurator-price-feed-insights";

const UPDATE_ASSET_PRICE_FEED_SIG = "updateAssetPriceFeed(address,address,address)";
const UPDATE_ASSET_PRICE_FEED_SELECTOR = selectorOfSig(UPDATE_ASSET_PRICE_FEED_SIG);

const SET_BASE_TOKEN_PRICE_FEED_SIG = "setBaseTokenPriceFeed(address,address)";
const SET_BASE_TOKEN_PRICE_FEED_SELECTOR = selectorOfSig(SET_BASE_TOKEN_PRICE_FEED_SIG);

const CONFIG_GETTER = "getConfiguration(address)";
const PRICE_FEED_DESCRIPTION_ABI = ["function description() view returns (string)"];

const CHAINLINK_AGGREGATOR_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

type PriceFeedData = {
  price: string;
  priceNumeric: number;
  decimals: number;
  updatedAt: string;
  stale: boolean;
  denominator: string | null;
};

const STALENESS_THRESHOLD_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Parse a price feed description to extract the denominator.
 * E.g., "USDC / ETH price feed" -> "ETH", "ETH / USD" -> "USD"
 */
function parsePriceFeedDenominator(description: string): string | null {
  // Match patterns like "X / Y", "X / Y price feed", "X / Y SVR price feed"
  const match = description.match(/\/\s*(\w+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Check if a denominator represents USD
 */
function isUSDDenominator(denominator: string | null): boolean {
  if (!denominator) return true; // Default to USD if unknown
  return ["USD", "USDC", "USDT", "DAI", "PYUSD"].includes(denominator);
}

async function getPriceFeedCurrentData(
  provider: JsonRpcProvider,
  priceFeedAddress: string,
  priceFeedDescription?: string
): Promise<PriceFeedData | null> {
  if (priceFeedAddress === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  try {
    const iface = new Interface(CHAINLINK_AGGREGATOR_ABI);

    const [decimalsResult, roundDataResult] = await Promise.all([
      provider.call({ to: priceFeedAddress, data: iface.encodeFunctionData("decimals") }),
      provider.call({ to: priceFeedAddress, data: iface.encodeFunctionData("latestRoundData") }),
    ]);

    const decimals = Number(iface.decodeFunctionResult("decimals", decimalsResult)[0]);
    const roundData = iface.decodeFunctionResult("latestRoundData", roundDataResult);
    const answer = roundData[1] as bigint;
    const updatedAt = Number(roundData[3]);

    const now = Math.floor(Date.now() / 1000);
    const staleness = now - updatedAt;
    const stale = staleness > STALENESS_THRESHOLD_SECONDS;

    // Determine formatting based on the price feed description
    // "X / USD" means price in USD, "X / ETH" means price in ETH
    const denominator = priceFeedDescription ? parsePriceFeedDenominator(priceFeedDescription) : null;
    const isUSD = isUSDDenominator(denominator);
    const priceNumeric = Number(answer) / Math.pow(10, decimals);
    const price = isUSD
      ? formatUSDPrice(answer, decimals)
      : formatAssetDenominatedPrice(answer, decimals, denominator ?? undefined);

    return {
      price,
      priceNumeric,
      decimals,
      updatedAt: new Date(updatedAt * 1000).toISOString(),
      stale,
      denominator,
    };
  } catch (err) {
    logger.debug({ priceFeedAddress, err }, "Failed to get price feed current data");
    return null;
  }
}

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
};

type Configuration = {
  baseTokenPriceFeed: string;
  assetConfigs: AssetConfig[];
};

function normalizeConfiguration(value: unknown): Configuration | null {
  if (!value || typeof value !== "object") return null;
  const cfg = value as Record<string | number, unknown>;

  // Base token price feed is at index 4 in the configuration tuple
  const baseTokenPriceFeed = typeof cfg.baseTokenPriceFeed === "string"
    ? checksum(cfg.baseTokenPriceFeed)
    : typeof cfg[4] === "string"
      ? checksum(cfg[4])
      : "0x0000000000000000000000000000000000000000";

  const assetConfigsRaw = (cfg.assetConfigs ?? cfg["assetConfigs"] ?? []) as unknown;
  const assetConfigs: AssetConfig[] = Array.isArray(assetConfigsRaw)
    ? assetConfigsRaw
        .map((entry) => normalizeAssetConfig(entry))
        .filter((entry): entry is AssetConfig => entry !== null)
    : [];

  return {
    baseTokenPriceFeed,
    assetConfigs,
  };
}

function normalizeAssetConfig(value: unknown): AssetConfig | null {
  if (!value || typeof value !== "object") return null;
  const cfg = value as Record<string | number, unknown>;
  try {
    const asset = checksum(String(cfg.asset ?? cfg[0]));
    const priceFeed = checksum(String(cfg.priceFeed ?? cfg[1] ?? "0x0000000000000000000000000000000000000000"));
    return {
      asset,
      priceFeed,
    };
  } catch (err) {
    logger.debug({ err }, "Failed to normalise asset config");
    return null;
  }
}

async function getPriceFeedDescription(provider: JsonRpcProvider, priceFeedAddress: string): Promise<string> {
    if (priceFeedAddress === "0x0000000000000000000000000000000000000000") {
        return "None";
    }
    try {
        const iface = new Interface(PRICE_FEED_DESCRIPTION_ABI);
        const data = iface.encodeFunctionData("description");
        const result = await provider.call({ to: priceFeedAddress, data });
        const decoded = iface.decodeFunctionResult("description", result);
        const description = decoded[0] as string;
        return description && description.trim() ? description : "No description";
    } catch (err) {
        logger.debug({ priceFeedAddress, err }, "Failed to get price feed description");
        return "Custom feed";
    }
}

export const cometConfiguratorPriceFeedInsightsHandler: Handler = {
  name: "Configurator price feed insights",
  match: (ctx) => {
    if (!ctx.rawCalldata || ctx.rawCalldata.length < 10) return false;
    const selector = ctx.rawCalldata.slice(0, 10);
    return selector === UPDATE_ASSET_PRICE_FEED_SELECTOR || selector === SET_BASE_TOKEN_PRICE_FEED_SELECTOR;
  },
  expand: async (ctx) => {
    if (!ctx.parsed) return [];

    const selector = ctx.rawCalldata.slice(0, 10);
    const configuratorProxy = checksum(ctx.target);
    const insights: InsightRequest[] = [];

    // Handle setBaseTokenPriceFeed
    if (selector === SET_BASE_TOKEN_PRICE_FEED_SELECTOR) {
      const [cometProxyArg, newPriceFeedArg] = ctx.parsed.args ?? [];
      if (!cometProxyArg || !newPriceFeedArg) return insights;
      const cometProxy = checksum(String(cometProxyArg));
      const newPriceFeed = checksum(String(newPriceFeedArg));

      const entries: { label: string; value: string }[] = [
        {
          label: "Comet",
          value: formatCometLabel(ctx.chainId, cometProxy),
        },
        {
          label: "Base Token",
          value: formatBaseTokenLabel(ctx.chainId, cometProxy),
        },
      ];

      const provider = getProviderSafe(ctx.chainId);
      if (provider) {
        const iface = await getConfiguratorInterface(ctx.chainId, configuratorProxy, provider);
        if (iface) {
          const config = await getConfiguration(iface, provider, configuratorProxy, cometProxy);
          const oldPriceFeed = config?.baseTokenPriceFeed ?? "0x0000000000000000000000000000000000000000";

          // Get descriptions first, then use them to format prices correctly
          const [oldDescription, newDescription] = await Promise.all([
            getPriceFeedDescription(provider, oldPriceFeed),
            getPriceFeedDescription(provider, newPriceFeed),
          ]);

          const [oldPriceFeedData, newPriceFeedData] = await Promise.all([
            getPriceFeedCurrentData(provider, oldPriceFeed, oldDescription),
            getPriceFeedCurrentData(provider, newPriceFeed, newDescription),
          ]);

          // Show old price feed with current price
          if (oldPriceFeed !== "0x0000000000000000000000000000000000000000") {
            let oldValue = `${oldPriceFeed} ("${oldDescription}")`;
            if (oldPriceFeedData) {
              oldValue += ` • Price: ${oldPriceFeedData.price}`;
            }
            entries.push({
              label: "Old Price Feed",
              value: oldValue,
            });
          }

          // Show new price feed
          entries.push({
            label: "New Price Feed",
            value: `${newPriceFeed} ("${newDescription}")`,
          });

          // Add current price information for the new price feed
          if (newPriceFeedData) {
            entries.push({
              label: "Oracle Price",
              value: newPriceFeedData.price,
            });
            entries.push({
              label: "Last Update",
              value: newPriceFeedData.updatedAt,
            });
            if (newPriceFeedData.stale) {
              entries.push({
                label: "⚠️ Staleness Warning",
                value: "Price feed data is more than 24 hours old",
              });
            }
          }

          // Compare with DeFiLlama price if available
          const metadata = getCometMetadata(ctx.chainId, cometProxy);
          if (metadata?.baseTokenAddress) {
            const defiLlamaComparison = await compareWithDefiLlama(
              ctx.chainId,
              metadata.baseTokenAddress,
              newPriceFeedData?.priceNumeric,
              metadata.baseTokenSymbol,
              newPriceFeedData?.denominator
            );
            if (defiLlamaComparison) {
              entries.push(...defiLlamaComparison);
            }
          }

          // Verify price feed if it's a specific oracle type
          const verification = await verifyPriceFeed(provider, newPriceFeed, ctx.chainId);
          if (verification) {
            insights.push(insight({
              title: "Price Feed Verification",
              entries: verification,
              _handlerSource: handlerSource(HANDLER_NAME, "Verified price feed oracle type and snapshot ratio"),
            }));
          }

        } else {
          entries.push({ label: "Status", value: "Configurator ABI missing" });
        }
      } else {
        entries.push({ label: "Status", value: "Configure RPC to fetch current price feed" });
      }

      insights.push(
        insight({
          title: "Base Token Price Feed Update",
          entries,
          _handlerSource: handlerSource(HANDLER_NAME),
        })
      );

      return insights;
    }

    // Handle updateAssetPriceFeed
    const [cometProxyArg, assetArg, newPriceFeedArg] = ctx.parsed.args ?? [];
    if (!cometProxyArg || !assetArg || !newPriceFeedArg) return insights;
    const cometProxy = checksum(String(cometProxyArg));
    const asset = checksum(String(assetArg));
    const newPriceFeed = checksum(String(newPriceFeedArg));

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

    // Get metadata for asset information
    const metadata = getCometMetadata(ctx.chainId, cometProxy);
    const assetMeta = metadata?.assetsByAddress[checksum(asset)];

    const provider = getProviderSafe(ctx.chainId);
    if (provider) {
      const iface = await getConfiguratorInterface(ctx.chainId, configuratorProxy, provider);
      if (iface) {
        const config = await getConfiguration(iface, provider, configuratorProxy, cometProxy);
        const assetConfig = config?.assetConfigs.find((cfg) => cfg.asset === asset);
        const oldPriceFeed = assetConfig?.priceFeed ?? "0x0000000000000000000000000000000000000000";

        // Get descriptions first to determine price denomination
        const [oldDescription, newDescription] = await Promise.all([
            getPriceFeedDescription(provider, oldPriceFeed),
            getPriceFeedDescription(provider, newPriceFeed),
        ]);

        // Use the description to determine if price is in USD or another asset
        const newPriceFeedData = await getPriceFeedCurrentData(provider, newPriceFeed, newDescription);

        entries.push({
            label: "Old Price Feed",
            value: `${oldPriceFeed} ("${oldDescription}")`,
        });
        entries.push({
            label: "New Price Feed",
            value: `${newPriceFeed} ("${newDescription}")`,
        });

        // Add current price information for the new price feed
        if (newPriceFeedData) {
          entries.push({
            label: "Current Price",
            value: newPriceFeedData.price,
          });
          entries.push({
            label: "Last Update",
            value: newPriceFeedData.updatedAt,
          });
          if (newPriceFeedData.stale) {
            entries.push({
              label: "⚠️ Staleness Warning",
              value: "Price feed data is more than 24 hours old",
            });
          }
        }

        // Compare with DeFiLlama price if available
        // Use the price feed denominator to determine comparison method
        const defiLlamaComparison = await compareWithDefiLlama(
          ctx.chainId,
          asset,
          newPriceFeedData?.priceNumeric,
          assetMeta?.symbol,
          newPriceFeedData?.denominator
        );
        if (defiLlamaComparison) {
          entries.push(...defiLlamaComparison);
        }

        const verification = await verifyPriceFeed(provider, newPriceFeed, ctx.chainId);
        if (verification) {
            insights.push(insight({
                title: "Price Feed Verification",
                entries: verification,
                _handlerSource: handlerSource(HANDLER_NAME, "Verified price feed oracle type and snapshot ratio"),
            }));
        }

      } else {
        entries.push({ label: "Status", value: "Configurator ABI missing" });
      }
    } else {
      entries.push({ label: "Status", value: "Configure RPC to fetch current price feed" });
    }

    insights.push(
      insight({
        title: "Price Feed Update",
        entries,
        _handlerSource: handlerSource(HANDLER_NAME),
      })
    );

    return insights;
  },
};

function getChainName(chainId: number): string {
    switch (chainId) {
        case 1: return "ethereum";
        case 10: return "optimism";
        case 137: return "polygon";
        case 8453: return "base";
        case 42161: return "arbitrum";
        case 59144: return "linea";
        case 534352: return "scroll";
        case 5000: return "mantle";
        default: return "ethereum";
    }
}

/**
 * Verify special oracle types (LST/LRT price feeds with snapshotRatio).
 * Returns null if the oracle is not a verifiable type (e.g., simple Chainlink feed).
 */
async function verifyPriceFeed(provider: JsonRpcProvider, oracleAddress: string, chainId: number): Promise<{ label: string; value: string }[] | null> {
    try {
        const iface = new Interface([
            "function snapshotTimestamp() view returns (uint256)",
            "function snapshotRatio() view returns (uint256)",
            "function ratioProvider() view returns (address)",
        ]);

        // Try to call snapshotRatio - if it fails, this is not a verifiable oracle type
        let snapshotTimestamp: bigint;
        let snapshotRatio: bigint;
        let ratioProvider: string;

        try {
            [snapshotTimestamp, snapshotRatio, ratioProvider] = await Promise.all([
                provider.call({ to: oracleAddress, data: iface.encodeFunctionData("snapshotTimestamp") }).then(res => iface.decodeFunctionResult("snapshotTimestamp", res)[0] as bigint),
                provider.call({ to: oracleAddress, data: iface.encodeFunctionData("snapshotRatio") }).then(res => iface.decodeFunctionResult("snapshotRatio", res)[0] as bigint),
                provider.call({ to: oracleAddress, data: iface.encodeFunctionData("ratioProvider") }).then(res => iface.decodeFunctionResult("ratioProvider", res)[0] as string),
            ]);
        } catch {
            // Not a verifiable oracle type - skip verification
            return null;
        }

        const oracleType = await detectOracleType(provider, ratioProvider);
        if (!oracleType) {
            return [{ label: "Verification Status", value: "Could not auto-detect oracle type." }];
        }

        const chainName = getChainName(chainId);
        const blockData = await fetch(`https://coins.llama.fi/block/${chainName}/${snapshotTimestamp}`).then(res => res.json()) as { height?: number };
        const blockNumber = blockData.height;

        if (!blockNumber) {
            return [{ label: "Verification Status", value: `Could not retrieve block number for timestamp ${snapshotTimestamp}.` }];
        }

        const onchainRatio = await getOnchainRatio(provider, ratioProvider, oracleType, blockNumber);

        const success = snapshotRatio.toString() === onchainRatio.toString();

        return [
            { label: "Oracle Type", value: oracleType },
            { label: "Snapshot Timestamp", value: snapshotTimestamp.toString() },
            { label: "Block Number", value: blockNumber.toString() },
            { label: "Snapshot Ratio", value: snapshotRatio.toString() },
            { label: "On-chain Ratio", value: onchainRatio.toString() },
            { label: "Status", value: success ? "✅ Snapshot ratio matches on-chain ratio." : "❌ Snapshot ratio does NOT match on-chain ratio." },
        ];

    } catch (err) {
        logger.debug({ oracleAddress, err }, "Failed to verify price feed");
        return null;
    }
}

async function detectOracleType(provider: JsonRpcProvider, ratioProvider: string): Promise<string | null> {
    const checks = {
        "rseth": "function rsETHPrice() view returns (uint256)",
        "wsteth": "function stEthPerToken() view returns (uint256)",
        "erc4626": "function convertToAssets(uint256) view returns (uint256)",
        "ratebased": "function getRate() view returns (uint256)",
        "chainlink": "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    };

    for (const [type, sig] of Object.entries(checks)) {
        try {
            const iface = new Interface([sig]);
            const fragment = iface.fragments[0] as import("ethers").FunctionFragment;
            await provider.call({ to: ratioProvider, data: iface.encodeFunctionData(fragment.name, type === 'erc4626' ? [1] : []) });
            return type;
        } catch {
            // ignore
        }
    }
    return null;
}

async function getOnchainRatio(provider: JsonRpcProvider, ratioProvider: string, oracleType: string, blockNumber: number): Promise<any> {
    const blockTag = `0x${blockNumber.toString(16)}`;
    switch (oracleType) {
        case "chainlink": {
            const iface = new Interface(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]);
            const result = await provider.call({ to: ratioProvider, data: iface.encodeFunctionData("latestRoundData"), blockTag });
            return iface.decodeFunctionResult("latestRoundData", result)[1];
        }
        case "erc4626": {
            const iface = new Interface(["function convertToAssets(uint256) view returns (uint256)"]);
            const result = await provider.call({ to: ratioProvider, data: iface.encodeFunctionData("convertToAssets", [1000000000000000000n]), blockTag });
            return iface.decodeFunctionResult("convertToAssets", result)[0];
        }
        case "ratebased": {
            const iface = new Interface(["function getRate() view returns (uint256)"]);
            const result = await provider.call({ to: ratioProvider, data: iface.encodeFunctionData("getRate"), blockTag });
            return iface.decodeFunctionResult("getRate", result)[0];
        }
        case "rseth": {
            const iface = new Interface(["function rsETHPrice() view returns (uint256)"]);
            const result = await provider.call({ to: ratioProvider, data: iface.encodeFunctionData("rsETHPrice"), blockTag });
            return iface.decodeFunctionResult("rsETHPrice", result)[0];
        }
        case "wsteth": {
            const iface = new Interface(["function stEthPerToken() view returns (uint256)"]);
            const result = await provider.call({ to: ratioProvider, data: iface.encodeFunctionData("stEthPerToken"), blockTag });
            return iface.decodeFunctionResult("stEthPerToken", result)[0];
        }
        default:
            throw new Error(`Invalid oracle type: ${oracleType}`);
    }
}


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

function formatBaseTokenLabel(chainId: number, comet: string): string {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) return "Unknown";
  if (metadata.baseTokenSymbol) {
    return metadata.baseTokenAddress
      ? `${metadata.baseTokenSymbol} • ${metadata.baseTokenAddress}`
      : metadata.baseTokenSymbol;
  }
  return metadata.baseTokenAddress ?? "Unknown";
}

/**
 * Get the canonical address for a well-known denomination asset on a chain.
 * Used to fetch DeFiLlama prices for price feed denominators.
 */
function getDenominatorAddress(chainId: number, denominator: string): string | null {
  const denominatorUpper = denominator.toUpperCase();

  // ETH/WETH addresses by chain
  const ethAddresses: Record<number, string> = {
    1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",      // Mainnet WETH
    8453: "0x4200000000000000000000000000000000000006",   // Base WETH
    10: "0x4200000000000000000000000000000000000006",     // Optimism WETH
    42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum WETH
    137: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",   // Polygon WETH
  };

  if (denominatorUpper === "ETH" || denominatorUpper === "WETH") {
    return ethAddresses[chainId] ?? null;
  }

  // BTC addresses (for WBTC-denominated feeds)
  const btcAddresses: Record<number, string> = {
    1: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",      // Mainnet WBTC
    8453: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",   // Base cbBTC
  };

  if (denominatorUpper === "BTC" || denominatorUpper === "WBTC" || denominatorUpper === "CBBTC") {
    return btcAddresses[chainId] ?? null;
  }

  return null;
}

/**
 * Compare oracle price with DeFiLlama price for a token.
 * Uses the price feed's denominator (from description like "X / Y") to determine comparison method.
 * Returns comparison entries if successful.
 */
async function compareWithDefiLlama(
  chainId: number,
  tokenAddress: string,
  oraclePriceNumeric: number | undefined,
  fallbackSymbol?: string,
  priceFeedDenominator?: string | null
): Promise<{ label: string; value: string }[] | null> {
  const chainName = getChainNameForDefiLlama(chainId);
  if (!chainName) return null;

  try {
    const normalizedAddress = tokenAddress.toLowerCase();
    const isUSDDenom = isUSDDenominator(priceFeedDenominator ?? null);

    // Build the coins query - include denominator asset if it's not USD
    const coinsToFetch = [`${chainName}:${normalizedAddress}`];
    let denominatorAddress: string | null = null;

    if (!isUSDDenom && priceFeedDenominator) {
      denominatorAddress = getDenominatorAddress(chainId, priceFeedDenominator);
      if (denominatorAddress) {
        coinsToFetch.push(`${chainName}:${denominatorAddress.toLowerCase()}`);
      }
    }

    const url = `https://coins.llama.fi/prices/current/${coinsToFetch.join(",")}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data = await response.json() as { coins?: Record<string, { price?: number; symbol?: string; confidence?: number }> };
    const coinKey = `${chainName}:${normalizedAddress}`;
    const coinData = data.coins?.[coinKey];
    if (!coinData?.price) return null;

    const assetUsdPrice = coinData.price;
    const symbol = coinData.symbol ?? fallbackSymbol ?? "Token";
    const confidence = coinData.confidence;

    const entries: { label: string; value: string }[] = [];

    if (isUSDDenom) {
      // For USD-denominated feeds, compare directly
      entries.push({
        label: "DeFiLlama Price",
        value: `$${assetUsdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} (${symbol})`,
      });

      if (oraclePriceNumeric !== undefined && oraclePriceNumeric > 0) {
        const deviation = ((oraclePriceNumeric - assetUsdPrice) / assetUsdPrice) * 100;
        const deviationStr = deviation >= 0 ? `+${deviation.toFixed(2)}%` : `${deviation.toFixed(2)}%`;
        const deviationWarning = Math.abs(deviation) > 5 ? " ⚠️" : "";
        entries.push({
          label: "Price Deviation",
          value: `${deviationStr}${deviationWarning}`,
        });
      }
    } else if (denominatorAddress) {
      // For non-USD denominated feeds (e.g., USDC/ETH), calculate expected ratio
      const denomKey = `${chainName}:${denominatorAddress.toLowerCase()}`;
      const denomData = data.coins?.[denomKey];
      if (denomData?.price) {
        const denomUsdPrice = denomData.price;
        const expectedRatio = assetUsdPrice / denomUsdPrice;

        entries.push({
          label: "DeFiLlama USD Prices",
          value: `${symbol}: $${assetUsdPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}, ${priceFeedDenominator}: $${denomUsdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        });
        entries.push({
          label: `Expected ${symbol}/${priceFeedDenominator}`,
          value: expectedRatio < 0.0001 ? expectedRatio.toExponential(4) : expectedRatio.toFixed(6),
        });

        if (oraclePriceNumeric !== undefined && oraclePriceNumeric > 0) {
          const deviation = ((oraclePriceNumeric - expectedRatio) / expectedRatio) * 100;
          const deviationStr = deviation >= 0 ? `+${deviation.toFixed(2)}%` : `${deviation.toFixed(2)}%`;
          const deviationWarning = Math.abs(deviation) > 5 ? " ⚠️" : "";
          entries.push({
            label: "Price Deviation",
            value: `${deviationStr}${deviationWarning}`,
          });
        }
      } else {
        // Fallback: show USD price only
        entries.push({
          label: "DeFiLlama Price",
          value: `$${assetUsdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} (${symbol})`,
        });
        entries.push({
          label: "Note",
          value: `Denominator (${priceFeedDenominator}) price not available for ratio comparison`,
        });
      }
    } else {
      // Unknown denominator - just show USD price
      entries.push({
        label: "DeFiLlama Price",
        value: `$${assetUsdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} (${symbol})`,
      });
      if (priceFeedDenominator && !isUSDDenom) {
        entries.push({
          label: "Note",
          value: `Unknown denominator "${priceFeedDenominator}" - showing USD price only`,
        });
      }
    }

    if (confidence !== undefined && confidence < 0.9) {
      entries.push({
        label: "⚠️ DeFiLlama Confidence",
        value: `${(confidence * 100).toFixed(0)}% (low confidence)`,
      });
    }

    return entries.length > 0 ? entries : null;
  } catch (err) {
    logger.debug({ chainId, tokenAddress, err }, "Failed to fetch DeFiLlama price");
    return null;
  }
}

function getChainNameForDefiLlama(chainId: number): string | null {
  switch (chainId) {
    case 1: return "ethereum";
    case 10: return "optimism";
    case 137: return "polygon";
    case 8453: return "base";
    case 42161: return "arbitrum";
    case 59144: return "linea";
    case 534352: return "scroll";
    case 5000: return "mantle";
    case 2020: return "ronin";
    case 130: return "unichain";
    default: return null;
  }
}
