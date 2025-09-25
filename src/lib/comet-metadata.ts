import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { checksum } from "@/utils";

export type CometAssetMetadata = {
  symbol: string;
  name?: string | null;
  address: string;
  decimals?: number;
};

export type CometMetadata = {
  name: string;
  symbol: string;
  baseTokenSymbol?: string;
  baseTokenAddress?: string;
  cometAddress: string;
  configuratorAddress: string;
  assetsByAddress: Record<string, CometAssetMetadata>;
};

const CHAIN_DIRECTORY: Record<number, string> = {
  1: "mainnet",
  10: "optimism",
  8453: "base",
  42161: "arbitrum",
  59144: "linea",
  534352: "scroll",
  130: "unichain",
  43113: "fuji",
  11155111: "sepolia",
  5: "hardhat",
  137: "polygon",
  314: "mantle",
  5000: "mantle",
};

const DEPLOYMENTS_ROOT = join(process.cwd(), "vendor", "comet", "deployments");

type ChainMetadata = {
  byConfigurator: Map<string, CometMetadata>;
  byComet: Map<string, CometMetadata>;
};

const chainCache = new Map<number, ChainMetadata>();

export function getConfiguratorMetadata(chainId: number, configuratorAddress: string): CometMetadata | null {
  const chainMeta = ensureChainMetadata(chainId);
  if (!chainMeta) return null;
  return chainMeta.byConfigurator.get(checksum(configuratorAddress)) ?? null;
}

export function getCometMetadata(chainId: number, cometAddress: string): CometMetadata | null {
  const chainMeta = ensureChainMetadata(chainId);
  if (!chainMeta) return null;
  return chainMeta.byComet.get(checksum(cometAddress)) ?? null;
}

function ensureChainMetadata(chainId: number): ChainMetadata | null {
  if (chainCache.has(chainId)) return chainCache.get(chainId)!;

  const dirName = CHAIN_DIRECTORY[chainId];
  if (!dirName) {
    chainCache.set(chainId, { byConfigurator: new Map(), byComet: new Map() });
    return chainCache.get(chainId)!;
  }

  const chainPath = join(DEPLOYMENTS_ROOT, dirName);
  const metadata: ChainMetadata = { byConfigurator: new Map(), byComet: new Map() };

  if (!existsSync(chainPath)) {
    chainCache.set(chainId, metadata);
    return metadata;
  }

  const assetDirs = readdirSync(chainPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const assetDir of assetDirs) {
    const folderPath = join(chainPath, assetDir);
    const rootsPath = join(folderPath, "roots.json");
    const configPath = join(folderPath, "configuration.json");
    if (!existsSync(rootsPath) || !existsSync(configPath)) {
      continue;
    }

    try {
      const rootsRaw = JSON.parse(readFileSync(rootsPath, "utf8")) as Record<string, unknown>;
      const configurationRaw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;

      const cometAddress = checksum(String(rootsRaw.comet));
      const configuratorAddress = checksum(String(rootsRaw.configurator));

      const assetsByAddress: Record<string, CometAssetMetadata> = {};
      const assets = configurationRaw.assets as Record<string, any> | undefined;
      if (assets) {
        for (const [assetSymbol, assetValue] of Object.entries(assets)) {
          const address = assetValue?.address as string | undefined;
          if (!address) continue;
          const entry: CometAssetMetadata = {
            symbol: assetSymbol,
            name: assetValue?.name ?? null,
            address: checksum(address),
            decimals: parseOptionalNumber(assetValue?.decimals),
          };
          assetsByAddress[entry.address] = entry;
        }
      }

      const name = typeof configurationRaw.name === "string" ? configurationRaw.name : assetDir;
      const symbol = typeof configurationRaw.symbol === "string" ? configurationRaw.symbol : assetDir;
      const baseTokenSymbol =
        typeof configurationRaw.baseToken === "string" ? configurationRaw.baseToken : undefined;
      const baseTokenAddressRaw = configurationRaw.baseTokenAddress;
      const baseTokenAddress =
        typeof baseTokenAddressRaw === "string" && baseTokenAddressRaw
          ? checksum(baseTokenAddressRaw)
          : undefined;

      const cometMetadata: CometMetadata = {
        name,
        symbol,
        baseTokenSymbol,
        baseTokenAddress,
        cometAddress,
        configuratorAddress,
        assetsByAddress,
      };

      metadata.byConfigurator.set(configuratorAddress, cometMetadata);
      metadata.byComet.set(cometAddress, cometMetadata);
    } catch (err) {
      console.error("Failed to parse comet metadata", chainId, assetDir, err);
    }
  }

  chainCache.set(chainId, metadata);
  return metadata;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value.replace(/[^0-9.\-eE]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
