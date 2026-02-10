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
  simulatorRpcUrl?: string;
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

/**
 * Clear the cached config so the next call to loadConfig() re-reads from disk.
 * Used by the portal to pick up config changes at runtime.
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  cachedConfig = JSON.parse(raw) as AppConfig;
  return cachedConfig;
}

export function getChainByChainId(chainId: number): ChainConfig | null {
  const config = loadConfig();
  for (const chain of Object.values(config.chains)) {
    if (chain.chainId === chainId) return chain;
  }
  return null;
}

export function getRpcUrl(chainId: number): string | undefined {
  return getChainByChainId(chainId)?.rpcUrl;
}

export function getChainDirectory(chainId: number): string | undefined {
  return getChainByChainId(chainId)?.directory;
}

export function getEtherscanApiKey(): string {
  return loadConfig().etherscanApiKey;
}
