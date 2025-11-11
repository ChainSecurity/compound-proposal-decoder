import { Interface, JsonRpcProvider } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata } from "@/lib/comet-metadata";

const UPDATE_ASSET_PRICE_FEED_SIG = "updateAssetPriceFeed(address,address,address)";
const UPDATE_ASSET_PRICE_FEED_SELECTOR = selectorOfSig(UPDATE_ASSET_PRICE_FEED_SIG);

const CONFIG_GETTER = "getConfiguration(address)";
const PRICE_FEED_DESCRIPTION_ABI = ["function description() view returns (string)"];

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
        return decoded[0] as string;
    } catch (err) {
        logger.debug({ priceFeedAddress, err }, "Failed to get price feed description");
        return "Error fetching description";
    }
}

export const cometConfiguratorPriceFeedInsightsHandler: Handler = {
  name: "Configurator price feed insights",
  match: (ctx) => {
    if (!ctx.rawCalldata || ctx.rawCalldata.length < 10) return false;
    const selector = ctx.rawCalldata.slice(0, 10);
    return selector === UPDATE_ASSET_PRICE_FEED_SELECTOR;
  },
  expand: async (ctx) => {
    if (!ctx.parsed) return [];

    const configuratorProxy = checksum(ctx.target);
    const insights: InsightRequest[] = [];

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

    const provider = getProviderSafe(ctx.chainId);
    if (provider) {
      const iface = await getConfiguratorInterface(ctx.chainId, configuratorProxy, provider);
      if (iface) {
        const config = await getConfiguration(iface, provider, configuratorProxy, cometProxy);
        const assetConfig = config?.assetConfigs.find((cfg) => cfg.asset === asset);
        const oldPriceFeed = assetConfig?.priceFeed ?? "0x0000000000000000000000000000000000000000";

        const [oldDescription, newDescription] = await Promise.all([
            getPriceFeedDescription(provider, oldPriceFeed),
            getPriceFeedDescription(provider, newPriceFeed),
        ]);

        entries.push({
            label: "Old Price Feed",
            value: `${oldPriceFeed} ("${oldDescription}")`,
        });
        entries.push({
            label: "New Price Feed",
            value: `${newPriceFeed} ("${newDescription}")`,
        });
        const verification = await verifyPriceFeed(provider, newPriceFeed);
        if (verification) {
            insights.push(insight({
                title: "Price Feed Verification",
                entries: verification,
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
      })
    );

    return insights;
  },
};

async function verifyPriceFeed(provider: JsonRpcProvider, oracleAddress: string): Promise<{ label: string; value: string }[] | null> {
    try {
        const iface = new Interface([
            "function snapshotTimestamp() view returns (uint256)",
            "function snapshotRatio() view returns (uint256)",
            "function ratioProvider() view returns (address)",
        ]);

        const [snapshotTimestamp, snapshotRatio, ratioProvider] = await Promise.all([
            provider.call({ to: oracleAddress, data: iface.encodeFunctionData("snapshotTimestamp") }).then(res => iface.decodeFunctionResult("snapshotTimestamp", res)[0]),
            provider.call({ to: oracleAddress, data: iface.encodeFunctionData("snapshotRatio") }).then(res => iface.decodeFunctionResult("snapshotRatio", res)[0]),
            provider.call({ to: oracleAddress, data: iface.encodeFunctionData("ratioProvider") }).then(res => iface.decodeFunctionResult("ratioProvider", res)[0]),
        ]);

        const oracleType = await detectOracleType(provider, ratioProvider);
        if (!oracleType) {
            return [{ label: "Verification Status", value: "Could not auto-detect oracle type." }];
        }

        const blockData = await fetch(`https://coins.llama.fi/block/ethereum/${snapshotTimestamp}`).then(res => res.json());
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
        return [{ label: "Verification Status", value: "Error during verification." }];
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
            await provider.call({ to: ratioProvider, data: iface.encodeFunctionData(iface.fragments[0].name, type === 'erc4626' ? [1] : []) });
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
