import { Interface, type JsonFragment } from "ethers";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { checksum } from "@/utils";
import { logger } from "@/logger";

const COMET_DEPLOYMENTS_DIR = join(process.cwd(), "vendor/comet/deployments");
const LOCAL_ABI_DIR = join(process.cwd(), "src/abi");

// Contract type to ABI file mapping
const CONTRACT_TYPE_ABI: Record<string, string> = {
  configurator: "Configurator.json",
  cometProxyAdmin: "CometProxyAdmin.json",
};

// Chain ID to deployment folder mapping
const CHAIN_DEPLOYMENT_FOLDER: Record<number, string> = {
  1: "mainnet",
  10: "optimism",
  137: "polygon",
  2020: "ronin",
  5000: "mantle",
  8453: "base",
  42161: "arbitrum",
  59144: "linea",
  534352: "scroll",
  130: "unichain",
};

// Hardcoded mappings for addresses not in roots.json (e.g., CometProxyAdmin)
const HARDCODED_ADDRESSES: Record<number, Record<string, string>> = {
  2020: {
    // Ronin CometProxyAdmin (used for deployAndUpgradeTo)
    "0xfa64A82a3d13D4c05d5133E53b2EbB8A0FA9c3F6": "cometProxyAdmin",
  },
};

type ContractMapping = {
  type: string;
  address: string;
};

// Cache: chainId -> address -> contract type
const addressToTypeCache: Map<number, Map<string, string>> = new Map();

// Cache: contract type -> Interface
const abiCache: Map<string, Interface> = new Map();

function loadLocalAbi(contractType: string): Interface | null {
  if (abiCache.has(contractType)) {
    return abiCache.get(contractType)!;
  }

  const abiFile = CONTRACT_TYPE_ABI[contractType];
  if (!abiFile) return null;

  const abiPath = join(LOCAL_ABI_DIR, abiFile);
  if (!existsSync(abiPath)) {
    logger.debug({ abiPath }, "Local ABI file not found");
    return null;
  }

  try {
    const abiJson = JSON.parse(readFileSync(abiPath, "utf8")) as JsonFragment[];
    const iface = new Interface(abiJson);
    abiCache.set(contractType, iface);
    return iface;
  } catch (err) {
    logger.warn({ abiPath, err }, "Failed to load local ABI");
    return null;
  }
}

function loadDeploymentRoots(chainId: number): Map<string, string> {
  if (addressToTypeCache.has(chainId)) {
    return addressToTypeCache.get(chainId)!;
  }

  const mapping = new Map<string, string>();

  // Add hardcoded addresses first
  const hardcoded = HARDCODED_ADDRESSES[chainId];
  if (hardcoded) {
    for (const [addr, type] of Object.entries(hardcoded)) {
      mapping.set(checksum(addr), type);
    }
  }

  const folder = CHAIN_DEPLOYMENT_FOLDER[chainId];

  if (!folder) {
    addressToTypeCache.set(chainId, mapping);
    return mapping;
  }

  const chainDir = join(COMET_DEPLOYMENTS_DIR, folder);
  if (!existsSync(chainDir)) {
    addressToTypeCache.set(chainId, mapping);
    return mapping;
  }

  try {
    // Each subfolder (usdc, weth, etc.) has a roots.json
    const markets = readdirSync(chainDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const market of markets) {
      const rootsPath = join(chainDir, market, "roots.json");
      if (!existsSync(rootsPath)) continue;

      try {
        const roots = JSON.parse(readFileSync(rootsPath, "utf8")) as Record<string, string>;

        // Map known contract types
        if (roots.configurator) {
          mapping.set(checksum(roots.configurator), "configurator");
        }
        if (roots.cometProxyAdmin) {
          mapping.set(checksum(roots.cometProxyAdmin), "cometProxyAdmin");
        }
        // bridgeReceiver often has deployAndUpgradeTo, uses CometProxyAdmin ABI pattern
        if (roots.bridgeReceiver) {
          mapping.set(checksum(roots.bridgeReceiver), "cometProxyAdmin");
        }
      } catch {
        // Skip malformed roots.json
      }
    }
  } catch (err) {
    logger.debug({ chainDir, err }, "Failed to read deployment directory");
  }

  addressToTypeCache.set(chainId, mapping);
  return mapping;
}

/**
 * Get a local ABI for a known Comet contract address.
 * Returns null if the address is not a known contract or ABI is not available.
 */
export function getLocalAbiFor(address: string, chainId: number): Interface | null {
  const checksumAddr = checksum(address);
  const mapping = loadDeploymentRoots(chainId);
  const contractType = mapping.get(checksumAddr);

  if (!contractType) {
    logger.trace({ address: checksumAddr, chainId }, "Address not found in local deployment roots");
    return null;
  }

  logger.debug({ address: checksumAddr, chainId, contractType }, "Found local ABI for address");
  return loadLocalAbi(contractType);
}
