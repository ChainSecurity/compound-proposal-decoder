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
