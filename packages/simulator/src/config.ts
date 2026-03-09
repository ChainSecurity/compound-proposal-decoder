import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  directory?: string;
  governorAddress?: string;
  timelockAddress?: string;
  bridge?: string;
  receiver?: string;
  l2msgsender?: string;
}

interface RawConfig {
  etherscanApiKey: string;
  tenderlyAccessToken?: string;
  tenderlyAccount?: string;
  tenderlyProject?: string;
  chains: Record<string, RawChainConfig>;
  defaults: {
    gas: string;
    gasPrice: string;
    robinhood: string;
    COMP: string;
  };
}

const TESTNETS_PATH = join(MONOREPO_ROOT, ".tenderly-testnets.json");

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

  // Transform to simulator config format
  const chains: Record<string, ChainConfig> = {};
  for (const [name, chain] of Object.entries(raw.chains)) {
    const rpcUrl = chain.rpcUrl ?? "";
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
 * Get the fork URL for Anvil (raw rpcUrl from compound-config.json)
 * This is used when spawning Anvil processes that need to fork from a public RPC.
 */
export function getForkUrl(chain: string): string | undefined {
  const raw = getRawConfig();
  return raw.chains[chain]?.rpcUrl;
}

interface TestnetEntry {
  rpcUrl: string;
  vnetId: string;
}

/**
 * Read the .tenderly-testnets.json file (always fresh from disk).
 * Returns an empty object if the file doesn't exist.
 * Handles both old format (string values) and new format ({ rpcUrl, vnetId } objects).
 */
function readTestnetsFile(): Record<string, TestnetEntry> {
  if (!existsSync(TESTNETS_PATH)) return {};
  const raw = JSON.parse(readFileSync(TESTNETS_PATH, "utf-8")) as Record<string, string | TestnetEntry>;
  // Migrate old format (plain string URLs) to new format
  const result: Record<string, TestnetEntry> = {};
  for (const [chain, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      result[chain] = { rpcUrl: value, vnetId: "" };
    } else {
      result[chain] = value;
    }
  }
  return result;
}

/**
 * Write the .tenderly-testnets.json file.
 */
function writeTestnetsFile(testnets: Record<string, TestnetEntry>): void {
  writeFileSync(TESTNETS_PATH, JSON.stringify(testnets, null, 2) + "\n", "utf-8");
}

/**
 * Get the simulator RPC URL (Tenderly virtual testnet URL).
 * Always reads fresh from .tenderly-testnets.json since URLs can change during refresh.
 */
export function getSimulatorRpcUrl(chain: string): string | undefined {
  const testnets = readTestnetsFile();
  return testnets[chain]?.rpcUrl;
}

/**
 * Get the Tenderly vnet ID for a chain, used for deletion via the API.
 */
export function getVnetId(chain: string): string | undefined {
  const testnets = readTestnetsFile();
  const vnetId = testnets[chain]?.vnetId;
  return vnetId || undefined;
}

export function getTenderlyApiConfig(): { accessToken: string; account: string; project: string } | undefined {
  const raw = getRawConfig();
  if (!raw.tenderlyAccessToken || !raw.tenderlyAccount || !raw.tenderlyProject) {
    return undefined;
  }
  return {
    accessToken: raw.tenderlyAccessToken,
    account: raw.tenderlyAccount,
    project: raw.tenderlyProject,
  };
}

export function getRawChainConfig(chainName: string): RawChainConfig | undefined {
  const raw = getRawConfig();
  return raw.chains[chainName];
}

export function getChainConfig(chainName: string): ChainConfig | undefined {
  return loadConfig().chains[chainName];
}

export function updateSimulatorRpcUrl(chainName: string, newRpcUrl: string, vnetId: string): void {
  const testnets = readTestnetsFile();
  testnets[chainName] = { rpcUrl: newRpcUrl, vnetId };
  writeTestnetsFile(testnets);
}

export function getDefaults(): Config["defaults"] {
  return loadConfig().defaults;
}
