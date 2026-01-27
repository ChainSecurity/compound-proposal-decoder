import { Interface, JsonRpcProvider } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata, type CometAssetMetadata } from "@/lib/comet-metadata";
import { formatUnits } from "ethers";
import { formatPercent, formatSupplyCap } from "@/lib/format-utils";

/**
 * Asset Configuration Insights Handler
 *
 * Compares updateAsset() calls against configuration.json values to highlight
 * differences in collateral factors, supply caps, etc.
 */

const UPDATE_ASSET_SIG = "updateAsset(address,(address,address,uint8,uint64,uint64,uint64,uint128))";
const UPDATE_ASSET_SELECTOR = selectorOfSig(UPDATE_ASSET_SIG);

const CONFIG_GETTER = "getConfiguration(address)";
const PRICE_FEED_DESCRIPTION_ABI = ["function description() view returns (string)"];
const CHAINLINK_AGGREGATOR_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

// Map of known token addresses to their DefiLlama identifiers
// Format: chainId -> address -> "chain:address" or "coingecko:id"
const DEFILLAMA_TOKEN_MAP: Record<number, Record<string, string>> = {
  2020: { // Ronin
    "0x0B7007c13325C48911F73A2daD5FA5dCBf808aDc": "coingecko:usd-coin", // USDC
    "0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4": "coingecko:ronin", // WRON
    "0x97a9107C1793BC407d6F527b77e7fff4D812bece": "coingecko:axie-infinity", // AXS
    "0xc99a6A985eD2Cac1ef41640596C5A5f9F4E19Ef5": "coingecko:weth", // WETH
  },
};

type PriceVerification = {
  oraclePrice: number;
  referencePrice: number | null;
  deviationPercent: number | null;
  isSignificantDeviation: boolean;
};

const PRICE_DEVIATION_THRESHOLD = 0.05; // 5% deviation threshold

async function fetchDefiLlamaPrices(tokenIds: string[]): Promise<Record<string, number>> {
  if (tokenIds.length === 0) return {};
  try {
    const coins = tokenIds.join(",");
    const response = await fetch(`https://coins.llama.fi/prices/current/${coins}`);
    if (!response.ok) {
      logger.debug({ status: response.status }, "DefiLlama API request failed");
      return {};
    }
    const data = await response.json() as { coins: Record<string, { price: number }> };
    const prices: Record<string, number> = {};
    for (const [id, info] of Object.entries(data.coins)) {
      prices[id] = info.price;
    }
    return prices;
  } catch (err) {
    logger.debug({ err }, "Failed to fetch DefiLlama prices");
    return {};
  }
}

async function verifyPriceAgainstReference(
  chainId: number,
  assetAddress: string,
  oraclePriceRaw: number,
  _baseTokenSymbol: string
): Promise<PriceVerification> {
  const result: PriceVerification = {
    oraclePrice: oraclePriceRaw,
    referencePrice: null,
    deviationPercent: null,
    isSignificantDeviation: false,
  };

  // Get DefiLlama identifier for the asset
  const tokenMap = DEFILLAMA_TOKEN_MAP[chainId];
  if (!tokenMap) return result;

  const assetId = tokenMap[checksum(assetAddress)];
  if (!assetId) return result;

  // Fetch USD price from DefiLlama
  const prices = await fetchDefiLlamaPrices([assetId]);
  const assetUsdPrice = prices[assetId];

  if (!assetUsdPrice) return result;

  // Compare oracle price (assumed to be in USD) with DeFiLlama USD price
  result.referencePrice = assetUsdPrice;

  // Calculate deviation
  if (oraclePriceRaw > 0) {
    const deviation = Math.abs(oraclePriceRaw - assetUsdPrice) / assetUsdPrice;
    result.deviationPercent = deviation * 100;
    result.isSignificantDeviation = deviation > PRICE_DEVIATION_THRESHOLD;
  }

  return result;
}

function getProviderSafe(chainId: number): JsonRpcProvider | null {
  try {
    return getProviderFor(chainId);
  } catch (err) {
    logger.debug({ chainId, err }, "Asset config insights: missing provider");
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

type OnChainAssetConfig = {
  asset: string;
  priceFeed: string;
};

type OnChainConfiguration = {
  assetConfigs: OnChainAssetConfig[];
};

async function getOnChainConfiguration(
  iface: Interface,
  provider: JsonRpcProvider,
  configuratorProxy: string,
  cometProxy: string
): Promise<OnChainConfiguration | null> {
  try {
    if (!iface.getFunction(CONFIG_GETTER)) return null;
    const data = iface.encodeFunctionData(CONFIG_GETTER, [cometProxy]);
    const raw = await provider.call({ to: configuratorProxy, data });
    const decoded = iface.decodeFunctionResult(CONFIG_GETTER, raw);
    if (!Array.isArray(decoded) || decoded.length === 0) return null;
    const cfg = decoded[0] as Record<string | number, unknown>;
    const assetConfigsRaw = (cfg.assetConfigs ?? cfg["assetConfigs"] ?? []) as unknown[];
    const assetConfigs: OnChainAssetConfig[] = Array.isArray(assetConfigsRaw)
      ? assetConfigsRaw.map((entry) => {
          const e = entry as Record<string | number, unknown>;
          return {
            asset: checksum(String(e.asset ?? e[0])),
            priceFeed: checksum(String(e.priceFeed ?? e[1] ?? "0x0000000000000000000000000000000000000000")),
          };
        })
      : [];
    return { assetConfigs };
  } catch (err) {
    logger.debug({ configuratorProxy, cometProxy, err }, "Failed to read on-chain configuration");
    return null;
  }
}

async function getPriceFeedDescription(provider: JsonRpcProvider, priceFeedAddress: string): Promise<string | null> {
  if (priceFeedAddress === "0x0000000000000000000000000000000000000000") {
    return "None";
  }
  try {
    const iface = new Interface(PRICE_FEED_DESCRIPTION_ABI);
    const data = iface.encodeFunctionData("description");
    const result = await provider.call({ to: priceFeedAddress, data });
    const decoded = iface.decodeFunctionResult("description", result);
    return decoded[0] as string;
  } catch (err) {
    logger.debug({ priceFeedAddress, err }, "Failed to get price feed description");
    return null;
  }
}

type PriceFeedResult = {
  formatted: string;
  raw: number;
};

async function getPriceFeedLatestPrice(provider: JsonRpcProvider, priceFeedAddress: string): Promise<PriceFeedResult | null> {
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
    // Format with appropriate precision - these may be USD or relative prices (e.g., ETH-denominated)
    const value = Number(formatUnits(answer, decimals));
    let formatted: string;
    if (value >= 1) {
      // Likely USD price or >= 1 ratio
      formatted = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } else {
      // Small value - likely a relative price like USDC/ETH, show more precision
      formatted = value.toPrecision(6);
    }
    return { formatted, raw: value };
  } catch (err) {
    logger.debug({ priceFeedAddress, err }, "Failed to get price feed latest price");
    return null;
  }
}

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

function compareAssetValues(
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
    entries.push(compareAssetValues("Borrow CF", proposedBorrowCF, configBorrowCF));

    const proposedLiquidateCF = formatPercent(config.liquidateCollateralFactor);
    const configLiquidateCF = assetMeta?.liquidateCF !== undefined
      ? `${(assetMeta.liquidateCF * 100).toFixed(2)}%`
      : undefined;
    entries.push(compareAssetValues("Liquidate CF", proposedLiquidateCF, configLiquidateCF));

    const proposedLiqFactor = formatPercent(config.liquidationFactor);
    const configLiqFactor = assetMeta?.liquidationFactor !== undefined
      ? `${(assetMeta.liquidationFactor * 100).toFixed(2)}%`
      : undefined;
    entries.push(compareAssetValues("Liquidation Factor", proposedLiqFactor, configLiqFactor));

    // Compare supply cap - this is critical
    const proposedCap = formatSupplyCap(config.supplyCap, config.decimals, assetSymbol);
    const configCapBigInt = parseConfigSupplyCap(assetMeta?.supplyCap, config.decimals);
    const configCap = configCapBigInt !== null
      ? formatSupplyCap(configCapBigInt, config.decimals, assetSymbol)
      : undefined;

    const isZeroCap = config.supplyCap === 0n;
    entries.push(compareAssetValues("Supply Cap", proposedCap, configCap, isZeroCap));

    // Add warning if supply cap is zero
    if (isZeroCap) {
      entries.push({
        label: "⚠️ WARNING",
        value: "Supply cap is ZERO - no deposits allowed for this asset",
      });
    }

    // Price feed comparison - fetch current from on-chain config
    const configuratorAddress = metadata?.configuratorAddress;
    const provider = getProviderSafe(ctx.chainId);

    if (provider && configuratorAddress) {
      const iface = await getConfiguratorInterface(ctx.chainId, configuratorAddress, provider);
      if (iface) {
        const onChainConfig = await getOnChainConfiguration(iface, provider, configuratorAddress, cometProxy);
        const currentAssetConfig = onChainConfig?.assetConfigs.find((cfg) => cfg.asset === config.asset);
        const currentPriceFeed = currentAssetConfig?.priceFeed;

        const baseTokenSymbol = metadata?.baseTokenSymbol ?? "ETH";

        if (currentPriceFeed && currentPriceFeed !== config.priceFeed) {
          // Price feed is changing - fetch descriptions for both and latest price from new feed
          const [oldDesc, newDesc, latestPrice] = await Promise.all([
            getPriceFeedDescription(provider, currentPriceFeed),
            getPriceFeedDescription(provider, config.priceFeed),
            getPriceFeedLatestPrice(provider, config.priceFeed),
          ]);
          const oldLabel = oldDesc ? `${currentPriceFeed} ("${oldDesc}")` : currentPriceFeed;
          const newLabel = newDesc ? `${config.priceFeed} ("${newDesc}")` : config.priceFeed;
          entries.push({
            label: "Price Feed",
            value: `${oldLabel} → ${newLabel}`,
          });
          if (latestPrice) {
            entries.push({ label: "Oracle Price", value: latestPrice.formatted });
            // Verify against reference price
            const verification = await verifyPriceAgainstReference(
              ctx.chainId,
              config.asset,
              latestPrice.raw,
              baseTokenSymbol
            );
            if (verification.referencePrice !== null) {
              const refFormatted = verification.referencePrice < 1
                ? verification.referencePrice.toPrecision(6)
                : verification.referencePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
              if (verification.isSignificantDeviation) {
                entries.push({
                  label: "⚠️ Reference Price",
                  value: `${refFormatted} (DefiLlama) - ${verification.deviationPercent?.toFixed(1)}% deviation!`,
                });
              } else {
                entries.push({
                  label: "Reference Price",
                  value: `${refFormatted} (DefiLlama) ✓`,
                });
              }
            }
          }
        } else if (currentPriceFeed === config.priceFeed) {
          // Price feed unchanged - still show current price
          const [desc, latestPrice] = await Promise.all([
            getPriceFeedDescription(provider, config.priceFeed),
            getPriceFeedLatestPrice(provider, config.priceFeed),
          ]);
          const label = desc ? `${config.priceFeed} ("${desc}")` : config.priceFeed;
          entries.push({ label: "Price Feed", value: `${label} (unchanged)` });
          if (latestPrice) {
            entries.push({ label: "Oracle Price", value: latestPrice.formatted });
            // Verify against reference price
            const verification = await verifyPriceAgainstReference(
              ctx.chainId,
              config.asset,
              latestPrice.raw,
              baseTokenSymbol
            );
            if (verification.referencePrice !== null) {
              const refFormatted = verification.referencePrice < 1
                ? verification.referencePrice.toPrecision(6)
                : verification.referencePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
              if (verification.isSignificantDeviation) {
                entries.push({
                  label: "⚠️ Reference Price",
                  value: `${refFormatted} (DefiLlama) - ${verification.deviationPercent?.toFixed(1)}% deviation!`,
                });
              } else {
                entries.push({
                  label: "Reference Price",
                  value: `${refFormatted} (DefiLlama) ✓`,
                });
              }
            }
          }
        } else {
          // No current config found, just show new with price
          const [desc, latestPrice] = await Promise.all([
            getPriceFeedDescription(provider, config.priceFeed),
            getPriceFeedLatestPrice(provider, config.priceFeed),
          ]);
          const label = desc ? `${config.priceFeed} ("${desc}")` : config.priceFeed;
          entries.push({ label: "Price Feed", value: label });
          if (latestPrice) {
            entries.push({ label: "Oracle Price", value: latestPrice.formatted });
            // Verify against reference price
            const verification = await verifyPriceAgainstReference(
              ctx.chainId,
              config.asset,
              latestPrice.raw,
              baseTokenSymbol
            );
            if (verification.referencePrice !== null) {
              const refFormatted = verification.referencePrice < 1
                ? verification.referencePrice.toPrecision(6)
                : verification.referencePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
              if (verification.isSignificantDeviation) {
                entries.push({
                  label: "⚠️ Reference Price",
                  value: `${refFormatted} (DefiLlama) - ${verification.deviationPercent?.toFixed(1)}% deviation!`,
                });
              } else {
                entries.push({
                  label: "Reference Price",
                  value: `${refFormatted} (DefiLlama) ✓`,
                });
              }
            }
          }
        }
      } else {
        entries.push({ label: "Price Feed", value: config.priceFeed });
      }
    } else {
      entries.push({ label: "Price Feed", value: config.priceFeed });
    }

    insights.push(
      insight({
        title: `Asset Config: ${assetSymbol}`,
        entries,
      })
    );

    return insights;
  },
};
