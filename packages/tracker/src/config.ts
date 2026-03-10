import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const MONOREPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const CONFIG_PATH = join(MONOREPO_ROOT, "compound-config.json");

export interface ChainConfig {
  chainId: number;
  rpcUrl?: string;
  directory?: string;
  governorAddress?: string;
  timelockAddress?: string;
  bridge?: string;
  receiver?: string;
  l2msgsender?: string;
}

export interface AppConfig {
  etherscanApiKey: string;
  chains: Record<string, ChainConfig>;
  defaults: {
    gas: string;
    gasPrice: string;
    robinhood: string;
    COMP: string;
  };
}

let cachedConfig: AppConfig | null = null;

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  cachedConfig = JSON.parse(raw) as AppConfig;
  return cachedConfig;
}

export function getMainnetConfig(): ChainConfig {
  const config = loadConfig();
  const mainnet = config.chains["mainnet"];
  if (!mainnet) throw new Error("Missing mainnet chain config");
  return mainnet;
}

export function getRpcUrl(chainName: string): string | undefined {
  const config = loadConfig();
  return config.chains[chainName]?.rpcUrl;
}

export function getChainByChainId(chainId: number): { name: string; config: ChainConfig } | null {
  const appConfig = loadConfig();
  for (const [name, chain] of Object.entries(appConfig.chains)) {
    if (chain.chainId === chainId) return { name, config: chain };
  }
  return null;
}

export function getReceiverAddress(chainName: string): string | undefined {
  const config = loadConfig();
  return config.chains[chainName]?.receiver;
}
