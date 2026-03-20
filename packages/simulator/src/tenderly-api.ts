/**
 * Tenderly REST API client for managing Virtual TestNets
 *
 * Provides functions to create, delete, and refresh Virtual TestNets
 * using the Tenderly platform API.
 */

import { getTenderlyApiConfig, getRawChainConfig, getSimulatorRpcUrl, getVnetId, updateSimulatorRpcUrl } from "./config";
import type { Logger } from "./core/types";
import { nullLogger } from "./core/types";

const TENDERLY_API_BASE = "https://api.tenderly.co/api/v1";

interface TenderlyRpc {
  name: string;
  url: string;
}

interface TenderlyVnetResponse {
  id: string;
  slug: string;
  display_name: string;
  rpcs: TenderlyRpc[];
}

/**
 * Make an authenticated request to the Tenderly API
 */
async function tenderlyFetch(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const apiConfig = getTenderlyApiConfig();
  if (!apiConfig) {
    throw new Error(
      "Tenderly API not configured. Set tenderlyAccessToken, tenderlyAccount, and tenderlyProject in compound-config.json"
    );
  }

  const url = `${TENDERLY_API_BASE}/account/${apiConfig.account}/project/${apiConfig.project}${path}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Access-Key": apiConfig.accessToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return response;
}

/**
 * Delete a Virtual TestNet by its ID
 */
async function deleteVirtualTestnet(vnetId: string, logger: Logger = nullLogger): Promise<boolean> {
  logger.step(`Deleting virtual testnet ${vnetId}`);

  const response = await tenderlyFetch(`/vnets/${vnetId}`, { method: "DELETE" });

  if (!response.ok) {
    const text = await response.text();
    logger.warn(`Failed to delete testnet ${vnetId}: ${response.status} ${text}`);
    return false;
  }

  logger.done(`Deleted virtual testnet ${vnetId}`);
  return true;
}

/**
 * Create a new Virtual TestNet for a specific chain
 *
 * Returns the Admin RPC URL and vnet ID for the new testnet
 */
async function createVirtualTestnet(
  chain: string,
  logger: Logger = nullLogger,
  proposalId?: string
): Promise<{ rpcUrl: string; vnetId: string; displayName: string }> {
  const rawChainConfig = getRawChainConfig(chain);
  if (!rawChainConfig) {
    throw new Error(`No chain config found for: ${chain}`);
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  const idPart = proposalId ?? "calldata";
  const slug = `pd-${idPart}-${date}-${time}-${rand}-${chain}`;
  const displayName = `pd-${idPart}-${date}-${time}`;

  logger.step(`Creating virtual testnet for ${chain} (chainId: ${rawChainConfig.chainId})`);

  const response = await tenderlyFetch("/vnets", {
    method: "POST",
    body: {
      slug,
      display_name: displayName,
      fork_config: {
        network_id: rawChainConfig.chainId,
        block_number: "latest",
      },
      virtual_network_config: {
        chain_config: {
          chain_id: rawChainConfig.chainId,
        },
      },
      sync_state_config: {
        enabled: false,
        commitment_level: "latest",
      },
      explorer_page_config: {
        enabled: false,
        verification_visibility: "bytecode",
      },
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create virtual testnet for ${chain}: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TenderlyVnetResponse;

  // Extract the Admin RPC URL from the response
  const adminRpc = data.rpcs?.find((rpc) => rpc.name === "Admin RPC");
  if (!adminRpc?.url) {
    throw new Error(`No Admin RPC URL in create response for ${chain}`);
  }

  logger.done(`Created virtual testnet for ${chain}: ${adminRpc.url} (vnetId: ${data.id})`);
  return { rpcUrl: adminRpc.url, vnetId: data.id, displayName };
}

export interface VirtualTestnetInfo {
  id: string;
  slug: string;
  displayName: string;
}

/**
 * List all Virtual TestNets from the Tenderly API.
 */
export async function listVirtualTestnets(): Promise<VirtualTestnetInfo[]> {
  const response = await tenderlyFetch("/vnets");
  if (!response.ok) {
    throw new Error(`Failed to list virtual testnets: ${response.status}`);
  }
  const data = (await response.json()) as TenderlyVnetResponse[];
  return data.map((vnet) => ({
    id: vnet.id,
    slug: vnet.slug,
    displayName: vnet.display_name,
  }));
}

export interface RefreshResult {
  chain: string;
  success: boolean;
  oldRpcUrl?: string;
  newRpcUrl?: string;
  error?: string;
}

/**
 * Refresh a Virtual TestNet for a chain: delete the old one and create a fresh one.
 * Updates .tenderly-testnets.json with the new RPC URL.
 */
export async function refreshVirtualTestnet(
  chain: string,
  logger: Logger = nullLogger,
  proposalId?: string,
  deleteOld: boolean = false
): Promise<RefreshResult> {
  try {
    const oldRpcUrl = getSimulatorRpcUrl(chain);

    // Optionally delete the existing testnet
    if (deleteOld) {
      const oldVnetId = getVnetId(chain);
      if (oldVnetId) {
        await deleteVirtualTestnet(oldVnetId, logger);
      }
    }

    // Create a fresh testnet
    const { rpcUrl: newRpcUrl, vnetId: newVnetId, displayName } = await createVirtualTestnet(chain, logger, proposalId);

    // Update config with the new URL, vnet ID, and display name
    updateSimulatorRpcUrl(chain, newRpcUrl, newVnetId, displayName);

    return { chain, success: true, oldRpcUrl, newRpcUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to refresh testnet for ${chain}: ${message}`);
    return { chain, success: false, error: message };
  }
}

/**
 * Refresh Virtual TestNets for multiple chains.
 * Deletes old testnets and creates fresh ones, updating config.
 */
export async function refreshVirtualTestnets(
  chains: string[],
  logger: Logger = nullLogger,
  proposalId?: string,
  deleteOld: boolean = false
): Promise<RefreshResult[]> {
  logger.section("Refreshing Virtual TestNets");

  const results: RefreshResult[] = [];
  for (const chain of chains) {
    const result = await refreshVirtualTestnet(chain, logger, proposalId, deleteOld);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  if (successCount === chains.length) {
    logger.done(`All ${chains.length} testnets refreshed successfully`);
  } else {
    logger.warn(`${successCount}/${chains.length} testnets refreshed`);
  }

  return results;
}
