import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, ChainConfig } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const MONOREPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const CONFIG_PATH = join(MONOREPO_ROOT, "compound-config.json");

interface RawChainConfig {
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

interface RawConfig {
  etherscanApiKey: string;
  chains: Record<string, RawChainConfig>;
  defaults: {
    gas: string;
    gasPrice: string;
    robinhood: string;
    COMP: string;
  };
}

let cachedConfig: Config | null = null;
let cachedRawConfig: RawConfig | null = null;

/**
 * Clear the cached config so the next call to loadConfig() re-reads from disk.
 * Used by the portal to pick up config changes at runtime.
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedRawConfig = null;
}

function getRawConfig(): RawConfig {
  if (cachedRawConfig) return cachedRawConfig;
  cachedRawConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as RawConfig;
  return cachedRawConfig;
}

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const raw = getRawConfig();

  // Transform to simulator config format (uses simulatorRpcUrl as rpcUrl)
  const chains: Record<string, ChainConfig> = {};
  for (const [name, chain] of Object.entries(raw.chains)) {
    // Use simulatorRpcUrl if available, otherwise fall back to rpcUrl
    const rpcUrl = chain.simulatorRpcUrl ?? chain.rpcUrl ?? "";
    chains[name] = {
      rpcUrl,
      chainId: chain.chainId,
      governorAddress: chain.governorAddress,
      timelockAddress: chain.timelockAddress ?? "",
      receiver: chain.receiver,
      bridge: chain.bridge,
      l2msgsender: chain.l2msgsender,
    };
  }

  cachedConfig = {
    chains,
    defaults: raw.defaults,
  };

  return cachedConfig;
}

/**
 * Get the fork URL for Anvil (raw rpcUrl, not simulatorRpcUrl)
 * This is used when spawning Anvil processes that need to fork from a public RPC.
 */
export function getForkUrl(chain: string): string | undefined {
  const raw = getRawConfig();
  return raw.chains[chain]?.rpcUrl;
}

/**
 * Get the simulator RPC URL (Tenderly virtual testnet URL)
 */
export function getSimulatorRpcUrl(chain: string): string | undefined {
  const raw = getRawConfig();
  const chainConfig = raw.chains[chain];
  return chainConfig?.simulatorRpcUrl ?? chainConfig?.rpcUrl;
}

export function getChainConfig(chainName: string): ChainConfig | undefined {
  return loadConfig().chains[chainName];
}

export function getDefaults(): Config["defaults"] {
  return loadConfig().defaults;
}
