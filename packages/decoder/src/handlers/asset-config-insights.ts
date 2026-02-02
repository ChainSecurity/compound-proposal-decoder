import { Interface, JsonRpcProvider } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata, type CometAssetMetadata } from "@/lib/comet-metadata";
import { formatUnits } from "ethers";
import { formatPercent, formatSupplyCap } from "@/lib/format-utils";
import type { CallInsight, CallInsightEntry, DecoderOptions } from "@/types";
import { sourced, handlerSource, onChainSource, externalApiSource, staticMetadataSource, calldataSource } from "@/types/sources";
import type { Sourced } from "@/types/sources";
import { getContractName } from "@/ethers";

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
const ERC20_SYMBOL_ABI = ["function symbol() view returns (string)"];

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

// Fallback token symbols for chains without Etherscan support
// Format: chainId -> checksummed address -> symbol
const KNOWN_TOKEN_SYMBOLS: Record<number, Record<string, string>> = {
  2020: { // Ronin
    "0x0B7007c13325C48911F73A2daD5FA5dCBf808aDc": "USDC",
    "0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4": "WRON",
    "0x97a9107C1793BC407d6F527b77e7fff4D812bece": "AXS",
    "0xc99a6A985eD2Cac1ef41640596C5A5f9F4E19Ef5": "WETH",
  },
};

type PriceVerification = {
  oraclePrice: number;
  referencePrice: number | null;
  deviationPercent: number | null;
  isSignificantDeviation: boolean;
};

const PRICE_DEVIATION_THRESHOLD = 0.05; // 5% deviation threshold

type DefiLlamaTokenInfo = {
  price: number;
  symbol: string;
  decimals: number;
  confidence: number;
};

async function fetchDefiLlamaTokenInfo(chainId: number, address: string): Promise<DefiLlamaTokenInfo | null> {
  try {
    // DefiLlama chain identifiers
    const chainMap: Record<number, string> = {
      1: "ethereum",
      10: "optimism",
      137: "polygon",
      8453: "base",
      42161: "arbitrum",
      534352: "scroll",
      5000: "mantle",
      2020: "ronin",
    };
    const chain = chainMap[chainId];
    if (!chain) {
      logger.debug({ chainId }, "Chain not supported by DefiLlama");
      return null;
    }

    const coinId = `${chain}:${address}`;
    const response = await fetch(`https://coins.llama.fi/prices/current/${coinId}`);
    if (!response.ok) {
      logger.debug({ status: response.status, coinId }, "DefiLlama API request failed");
      return null;
    }
    const data = await response.json() as { coins: Record<string, DefiLlamaTokenInfo> };
    const tokenInfo = data.coins[coinId];
    if (!tokenInfo) {
      logger.debug({ coinId }, "Token not found in DefiLlama");
      return null;
    }
    return tokenInfo;
  } catch (err) {
    logger.debug({ err }, "Failed to fetch DefiLlama token info");
    return null;
  }
}

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

/**
 * Fetch token symbol directly from the contract via RPC.
 * This is the most reliable source of truth for ERC20 tokens.
 */
async function getTokenSymbolOnChain(provider: JsonRpcProvider, tokenAddress: string): Promise<string | null> {
  try {
    const iface = new Interface(ERC20_SYMBOL_ABI);
    const data = iface.encodeFunctionData("symbol");
    const result = await provider.call({ to: tokenAddress, data });
    const decoded = iface.decodeFunctionResult("symbol", result);
    return decoded[0] as string;
  } catch (err) {
    logger.debug({ tokenAddress, err }, "Failed to get token symbol from contract");
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

const HANDLER_NAME = "asset-config-insights";

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
    const trackSources = ctx.options?.trackSources ?? false;

    // Get metadata from configuration.json
    const metadata = getCometMetadata(ctx.chainId, cometProxy);
    const assetMeta = metadata?.assetsByAddress[config.asset];
    const provider = getProviderSafe(ctx.chainId);

    // Resolve token symbol with verification:
    // 1. Comet metadata (vendor/comet config files) - trusted
    // 2. Etherscan contract name - trusted (verified contracts)
    // 3. DefiLlama token lookup - trusted (curated token list)
    // 4. On-chain symbol() - UNTRUSTED (anyone can deploy fake tokens)
    // 5. Hardcoded fallback map (last resort)
    let assetSymbol: string | undefined = assetMeta?.symbol;
    let assetNameSource: ReturnType<typeof staticMetadataSource> | ReturnType<typeof onChainSource> | ReturnType<typeof externalApiSource> | ReturnType<typeof handlerSource> | undefined;
    let isVerifiedToken = false;

    if (assetMeta) {
      // Source 1: Comet metadata - TRUSTED (Compound's official configs)
      assetSymbol = assetMeta.symbol;
      assetNameSource = staticMetadataSource(
        `vendor/comet/deployments/${ctx.chainId}/...`,
        `assets.${config.asset}.symbol`,
        metadata?.name
      );
      isVerifiedToken = true;
    } else {
      // Source 2: DefiLlama - TRUSTED (curated token database)
      const defiLlamaInfo = await fetchDefiLlamaTokenInfo(ctx.chainId, config.asset);
      if (defiLlamaInfo) {
        assetSymbol = defiLlamaInfo.symbol;
        assetNameSource = externalApiSource("defillama", `https://coins.llama.fi/prices/current/${ctx.chainId}:${config.asset}`);
        isVerifiedToken = true;
        logger.debug({ asset: config.asset, symbol: defiLlamaInfo.symbol }, "Token verified via DefiLlama");
      } else {
        // Source 3: Hardcoded map - TRUSTED (manually verified by us)
        const knownSymbol = KNOWN_TOKEN_SYMBOLS[ctx.chainId]?.[config.asset];
        if (knownSymbol) {
          assetSymbol = knownSymbol;
          assetNameSource = handlerSource(HANDLER_NAME, `Manually verified token in asset-config-insights.ts`);
          isVerifiedToken = true;
        } else if (provider) {
          // Source 4: On-chain symbol() - UNTRUSTED (anyone can deploy fake tokens)
          const onChainSymbol = await getTokenSymbolOnChain(provider, config.asset);
          if (onChainSymbol) {
            assetSymbol = onChainSymbol;
            assetNameSource = onChainSource(ctx.chainId, config.asset, "symbol()", [], `cast call ${config.asset} "symbol()(string)" --rpc-url $RPC_URL`);
            isVerifiedToken = false; // NOT verified - could be fake!
          } else {
            // Source 5: Etherscan contract name - UNTRUSTED (deployer chooses the name)
            const contractName = await getContractName(config.asset, ctx.chainId);
            if (contractName) {
              assetSymbol = contractName;
              assetNameSource = onChainSource(ctx.chainId, config.asset, "ContractName", [], "Etherscan (deployer-chosen name)");
              isVerifiedToken = false; // NOT verified - deployer can name it anything!
            } else {
              assetSymbol = "Unknown";
              isVerifiedToken = false;
            }
          }
        } else {
          // No provider - try Etherscan as last resort
          const contractName = await getContractName(config.asset, ctx.chainId);
          if (contractName) {
            assetSymbol = contractName;
            assetNameSource = onChainSource(ctx.chainId, config.asset, "ContractName", [], "Etherscan (deployer-chosen name)");
            isVerifiedToken = false; // NOT verified
          } else {
            assetSymbol = "Unknown";
            isVerifiedToken = false;
          }
        }
      }
    }

    const entries: CallInsightEntry[] = [];

    // Asset entry with metadata for rich rendering
    const assetEntry: CallInsightEntry = {
      label: trackSources
        ? sourced("Asset", handlerSource(HANDLER_NAME))
        : "Asset",
      value: trackSources
        ? sourced(config.asset, calldataSource(4, 20, config.asset, "abi"))
        : config.asset,
      metadata: {
        type: "address",
        chainId: ctx.chainId,
        resolvedName: assetSymbol && assetSymbol !== "Unknown"
          ? (trackSources && assetNameSource
              ? sourced(assetSymbol, assetNameSource)
              : assetSymbol)
          : undefined,
      },
    };
    entries.push(assetEntry);

    // Add warning if token is not verified
    if (!isVerifiedToken && assetSymbol && assetSymbol !== "Unknown") {
      entries.push(trackSources
        ? {
            label: sourced("⚠️ WARNING", handlerSource(HANDLER_NAME)),
            value: sourced(
              `Token symbol "${assetSymbol}" is UNVERIFIED - not found in Etherscan, DefiLlama, or Compound configs. Verify this is the correct token address!`,
              handlerSource(HANDLER_NAME, "Token verification check")
            ),
          }
        : {
            label: "⚠️ WARNING",
            value: `Token symbol "${assetSymbol}" is UNVERIFIED - not found in Etherscan, DefiLlama, or Compound configs. Verify this is the correct token address!`,
          }
      );
    }

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

    // Helper to wrap a value with external API source
    const withExternalApiSource = (
      value: string,
      api: string,
      endpoint: string
    ): string | ReturnType<typeof sourced<string>> => {
      if (!trackSources) return value;
      return sourced(value, externalApiSource(api, endpoint));
    };

    // Helper to create a sourced entry
    const createEntry = (
      label: string,
      value: string,
      valueSourceType: "calldata" | "config" | "computed" = "calldata"
    ): CallInsightEntry => {
      if (!trackSources) {
        return { label, value };
      }

      let valueSrc;
      if (valueSourceType === "calldata") {
        valueSrc = calldataSource(0, 32, value, "abi");
      } else if (valueSourceType === "config") {
        valueSrc = staticMetadataSource(
          `vendor/comet/deployments/${ctx.chainId}/...`,
          label.toLowerCase().replace(/\s+/g, "_"),
          metadata?.name
        );
      } else {
        valueSrc = handlerSource(HANDLER_NAME, `Computed from calldata`);
      }

      return {
        label: sourced(label, handlerSource(HANDLER_NAME)),
        value: sourced(value, valueSrc),
      };
    };

    // Compare collateral factors
    const proposedBorrowCF = formatPercent(config.borrowCollateralFactor);
    const configBorrowCF = assetMeta?.borrowCF !== undefined
      ? `${(assetMeta.borrowCF * 100).toFixed(2)}%`
      : undefined;
    const borrowCFEntry = compareAssetValues("Borrow CF", proposedBorrowCF, configBorrowCF);
    entries.push(trackSources
      ? { label: sourced(borrowCFEntry.label, handlerSource(HANDLER_NAME)), value: sourced(borrowCFEntry.value, calldataSource(0, 8, borrowCFEntry.value, "abi")) }
      : borrowCFEntry);

    const proposedLiquidateCF = formatPercent(config.liquidateCollateralFactor);
    const configLiquidateCF = assetMeta?.liquidateCF !== undefined
      ? `${(assetMeta.liquidateCF * 100).toFixed(2)}%`
      : undefined;
    const liquidateCFEntry = compareAssetValues("Liquidate CF", proposedLiquidateCF, configLiquidateCF);
    entries.push(trackSources
      ? { label: sourced(liquidateCFEntry.label, handlerSource(HANDLER_NAME)), value: sourced(liquidateCFEntry.value, calldataSource(0, 8, liquidateCFEntry.value, "abi")) }
      : liquidateCFEntry);

    const proposedLiqFactor = formatPercent(config.liquidationFactor);
    const configLiqFactor = assetMeta?.liquidationFactor !== undefined
      ? `${(assetMeta.liquidationFactor * 100).toFixed(2)}%`
      : undefined;
    const liqFactorEntry = compareAssetValues("Liquidation Factor", proposedLiqFactor, configLiqFactor);
    entries.push(trackSources
      ? { label: sourced(liqFactorEntry.label, handlerSource(HANDLER_NAME)), value: sourced(liqFactorEntry.value, calldataSource(0, 8, liqFactorEntry.value, "abi")) }
      : liqFactorEntry);

    // Compare supply cap - this is critical
    const proposedCap = formatSupplyCap(config.supplyCap, config.decimals, assetSymbol ?? "Unknown");
    const configCapBigInt = parseConfigSupplyCap(assetMeta?.supplyCap, config.decimals);
    const configCap = configCapBigInt !== null
      ? formatSupplyCap(configCapBigInt, config.decimals, assetSymbol ?? "Unknown")
      : undefined;

    const isZeroCap = config.supplyCap === 0n;
    const supplyCapEntry = compareAssetValues("Supply Cap", proposedCap, configCap, isZeroCap);
    entries.push(trackSources
      ? { label: sourced(supplyCapEntry.label, handlerSource(HANDLER_NAME)), value: sourced(supplyCapEntry.value, calldataSource(0, 16, supplyCapEntry.value, "abi")) }
      : supplyCapEntry);

    // Add warning if supply cap is zero
    if (isZeroCap) {
      entries.push(trackSources
        ? { label: sourced("⚠️ WARNING", handlerSource(HANDLER_NAME)), value: sourced("Supply cap is ZERO - no deposits allowed for this asset", handlerSource(HANDLER_NAME, "Computed warning")) }
        : { label: "⚠️ WARNING", value: "Supply cap is ZERO - no deposits allowed for this asset" }
      );
    }

    // Price feed comparison - fetch current from on-chain config
    const configuratorAddress = metadata?.configuratorAddress;

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
    } else if (provider) {
      // No configurator metadata, but we have a provider - still fetch price and verify
      const [desc, latestPrice] = await Promise.all([
        getPriceFeedDescription(provider, config.priceFeed),
        getPriceFeedLatestPrice(provider, config.priceFeed),
      ]);
      const label = desc ? `${config.priceFeed} ("${desc}")` : config.priceFeed;
      entries.push({ label: "Price Feed", value: label, metadata: { type: "address", chainId: ctx.chainId } });

      if (latestPrice) {
        entries.push({ label: "Oracle Price", value: latestPrice.formatted });
        // Verify against reference price from DefiLlama
        const verification = await verifyPriceAgainstReference(
          ctx.chainId,
          config.asset,
          latestPrice.raw,
          "USD" // Assume USD-denominated for new chains without metadata
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
      // No provider available - just show the address
      entries.push({ label: "Price Feed", value: config.priceFeed, metadata: { type: "address", chainId: ctx.chainId } });
    }

    const insightObj: CallInsight = {
      title: `Asset Config: ${assetSymbol ?? "Unknown"}`,
      entries,
      _handlerSource: trackSources ? handlerSource(HANDLER_NAME, `Compares asset configuration against on-chain values`) : undefined,
    };
    insights.push(insight(insightObj));

    return insights;
  },
};
