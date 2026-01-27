import type { JsonFragment } from "ethers";
import axios from "axios";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { checksum, ensureDir, requireEnv, sleep } from "@/utils";
import type { ProposalDetails, AddressMetadata } from "@/types";
import { JsonRpcProvider, Interface } from "ethers";
import { logger } from "@/logger";
import { getLocalAbiFor } from "@/local-abi";
import { getCometAssetMetadata, getCometContractLabel } from "@/lib/comet-metadata";

const GOVERNOR_PROXY = "0x309a862bbC1A00e45506cB8A802D1ff10004c8C0";
const CACHE_DIR = join(process.cwd(), ".cache");
const ABI_CACHE_DIR = join(CACHE_DIR, "abi-cache");
const CONTRACT_NAME_CACHE_DIR = join(CACHE_DIR, "contract-name-cache");
const ADDRESS_TAG_CACHE_DIR = join(CACHE_DIR, "address-tag-cache");

// Etherscan V2 base (unified across chains)
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

const GOVERNOR_MIN_ABI: JsonFragment[] = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "proposalDetails",
    outputs: [
      { internalType: "address[]", name: "targets", type: "address[]" },
      { internalType: "uint256[]", name: "values", type: "uint256[]" },
      { internalType: "bytes[]", name: "calldatas", type: "bytes[]" },
      { internalType: "bytes32", name: "descriptionHash", type: "bytes32" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

function cachePathFor(address: string, chainId = 1): string {
  const cacheDir = join(ABI_CACHE_DIR, String(chainId));
  ensureDir(cacheDir);
  return join(cacheDir, `${checksum(address)}.json`);
}

function nameCachePathFor(address: string, chainId = 1): string {
  const cacheDir = join(CONTRACT_NAME_CACHE_DIR, String(chainId));
  ensureDir(cacheDir);
  return join(cacheDir, `${checksum(address)}.json`);
}

function addressTagCachePathFor(address: string, chainId = 1): string {
  const cacheDir = join(ADDRESS_TAG_CACHE_DIR, String(chainId));
  ensureDir(cacheDir);
  return join(cacheDir, `${checksum(address)}.json`);
}

const RPC_URLS: Record<number, string> = {
  1: process.env.ETH_RPC_URL!,
  10: process.env.OP_RPC_URL!,
  130: process.env.UNICHAIN_RPC_URL!,
  137: process.env.POLYGON_RPC_URL!,
  2020: process.env.RONIN_RPC_URL || "https://api.roninchain.com/rpc",
  5000: process.env.MANTLE_RPC_URL!,
  8453: process.env.BASE_RPC_URL!,
  42161: process.env.ARB_RPC_URL!,
  59144: process.env.LINEA_RPC_URL!,
  534352: process.env.SCROLL_RPC_URL!,
};

export function getProviderFor(chainId: number): JsonRpcProvider {
  const url = RPC_URLS[chainId];
  logger.trace({ chainId, url }, "Getting provider");
  if (!url)
    throw new Error(`No RPC configured for chainId=${chainId}. Set <CHAIN>_RPC_URL env vars.`);
  return new JsonRpcProvider(url);
}

export async function callProposalDetails(
  provider: JsonRpcProvider,
  governor: string,
  proposalId: bigint
): Promise<ProposalDetails> {
  const iface = new Interface(GOVERNOR_MIN_ABI);
  const data = iface.encodeFunctionData("proposalDetails", [proposalId]);
  const result = await provider.call({
    to: checksum(governor),
    data,
  });
  const decodedResult = iface.decodeFunctionResult("proposalDetails", result);

  const proposalDetails: ProposalDetails = {
    targets: decodedResult[0] as string[],
    values: (decodedResult[1] as bigint[]).map(BigInt),
    calldatas: decodedResult[2] as string[],
    descriptionHash: decodedResult[3] as string,
  };

  return proposalDetails;
}

function buildV2Params(address: string, apiKey: string, chainId?: number) {
  // V2 requires a chainid; default to 1 if not provided
  const cid = chainId ?? 1;
  return `chainid=${cid}&address=${checksum(address)}&apikey=${apiKey}`;
}

export async function getAbiFor(address: string, chainId?: number): Promise<Interface | null> {
  const path = cachePathFor(address, chainId ?? 1);
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.__note === "unverified_or_missing" || parsed?.__note === "unsupported_chain") {
        // Try local ABI fallback for known contracts
        const localAbi = getLocalAbiFor(address, chainId ?? 1);
        if (localAbi) {
          logger.debug({ address, chainId }, "Using local ABI fallback");
          return localAbi;
        }
        return null;
      }
      logger.debug({ address, chainId }, "ABI cache hit");
      return new Interface(parsed as JsonFragment[]);
    } catch {
      // cache corrupted — fall through to refetch
      logger.debug({ address, chainId }, "ABI cache corrupted");
    }
  }
  logger.debug({ address, chainId }, "ABI cache miss");

  const apiKey = requireEnv("ETHERSCAN_API_KEY");
  const url = `${ETHERSCAN_V2_BASE}?module=contract&action=getabi&${buildV2Params(address, apiKey, chainId)}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      logger.trace({ address, chainId, attempt }, "Fetching ABI from Etherscan");
      const resp = await axios.get(url, { timeout: 15000 });
      const status = resp.data?.status;
      const result = resp.data?.result as string | undefined;

      if (status === "1" && result) {
        const abiJson = JSON.parse(result);
        writeFileSync(path, JSON.stringify(abiJson, null, 2));
        return new Interface(abiJson as JsonFragment[]);
      } else if (status === "0" && typeof result === "string" && /rate limit/i.test(result)) {
        logger.warn("Etherscan rate limit hit, retrying...");
        await sleep(1000 * (attempt + 1));
        continue;
      } else if (
        status === "0" &&
        typeof result === "string" &&
        /Missing|unsupported chainid/i.test(result)
      ) {
        // Chain not supported by Etherscan V2 - try local ABI fallback
        logger.debug({ address, chainId }, "Chain not supported by Etherscan V2");
        writeFileSync(path, JSON.stringify({ __note: "unsupported_chain" }, null, 2));
        const localAbi = getLocalAbiFor(address, chainId ?? 1);
        if (localAbi) {
          logger.debug({ address, chainId }, "Using local ABI fallback");
          return localAbi;
        }
        return null;
      } else {
        // unverified or other failure - try local ABI fallback
        logger.debug({ address, chainId }, "Contract not verified on Etherscan");
        writeFileSync(path, JSON.stringify({ __note: "unverified_or_missing" }, null, 2));
        const localAbi = getLocalAbiFor(address, chainId ?? 1);
        if (localAbi) {
          logger.debug({ address, chainId }, "Using local ABI fallback");
          return localAbi;
        }
        return null;
      }
    } catch (err: unknown) {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new Error(
        `Failed to fetch ABI for ${address}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return null;
}

export async function getContractName(address: string, chainId?: number): Promise<string | null> {
  const path = nameCachePathFor(address, chainId ?? 1);
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw);
      logger.debug({ address, chainId }, "Contract name cache hit");
      return parsed.name ?? null;
    } catch {
      // corrupted cache — fall through
      logger.debug({ address, chainId }, "Contract name cache corrupted");
    }
  }
  logger.debug({ address, chainId }, "Contract name cache miss");

  const apiKey = requireEnv("ETHERSCAN_API_KEY");
  const url = `${ETHERSCAN_V2_BASE}?module=contract&action=getsourcecode&${buildV2Params(
    address,
    apiKey,
    chainId
  )}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      logger.trace({ address, chainId, attempt }, "Fetching contract name from Etherscan");
      const resp = await axios.get(url, { timeout: 15000 });
      const status = resp.data?.status;
      const resultArr = resp.data?.result;

      if (status === "1" && Array.isArray(resultArr) && resultArr[0]?.ContractName) {
        const name = resultArr[0].ContractName as string;
        writeFileSync(path, JSON.stringify({ name }));
        return name;
      } else if (
        status === "0" &&
        typeof resp.data?.result === "string" &&
        /rate limit/i.test(resp.data.result)
      ) {
        logger.warn("Etherscan rate limit hit, retrying...");
        await sleep(1000 * (attempt + 1));
        continue;
      } else if (
        resp.data?.message === "NOTOK" &&
        typeof resp.data?.result === "string" &&
        /Invalid API Key/i.test(resp.data.result)
      ) {
        throw new Error(`Invalid Etherscan API key.`);
      } else if (
        status === "0" &&
        typeof resp.data?.result === "string" &&
        /Missing|unsupported chainid/i.test(resp.data.result)
      ) {
        // Chain not supported by Etherscan V2 - return null gracefully
        logger.debug({ address, chainId }, "Chain not supported by Etherscan V2 for contract name");
        writeFileSync(path, JSON.stringify({ name: null }));
        return null;
      } else {
        // Etherscan can be flaky — back off and retry
        await sleep(1000 * (attempt + 1));
        continue;
      }
    } catch {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
    }
  }

  // Cache sentinel for not found
  logger.debug({ address, chainId }, "Contract name not found on Etherscan");
  writeFileSync(path, JSON.stringify({ name: null }));
  return null;
}

type AddressTagInfo = {
  nameTag: string | null;
  labels: string[];
  otherAttributes: string[];
  url?: string | null;
  shortDescription?: string | null;
  notes?: string[];
};

async function getAddressTagInfo(address: string, chainId?: number): Promise<AddressTagInfo> {
  const path = addressTagCachePathFor(address, chainId ?? 1);
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw);
      return {
        nameTag: typeof parsed.nameTag === "string" ? parsed.nameTag : null,
        labels: Array.isArray(parsed.labels)
          ? parsed.labels.filter((l: unknown): l is string => typeof l === "string")
          : [],
        otherAttributes: Array.isArray(parsed.otherAttributes)
          ? parsed.otherAttributes.filter((l: unknown): l is string => typeof l === "string")
          : [],
        url: typeof parsed.url === "string" ? parsed.url : null,
        shortDescription:
          typeof parsed.shortDescription === "string" ? parsed.shortDescription : null,
        notes: Array.isArray(parsed.notes)
          ? parsed.notes.filter((l: unknown): l is string => typeof l === "string")
          : undefined,
      } satisfies AddressTagInfo;
    } catch {
      logger.debug({ address, chainId }, "Address tag cache corrupted");
    }
  }

  const apiKey = requireEnv("ETHERSCAN_API_KEY");
  const params = buildV2Params(address, apiKey, chainId);
  const url = `${ETHERSCAN_V2_BASE}?module=nametag&action=getaddresstag&${params}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      logger.trace({ address, chainId, attempt }, "Fetching address metadata from Etherscan");
      const resp = await axios.get(url, { timeout: 15000 });
      const status: string | undefined = resp.data?.status;
      const result = resp.data?.result;
      if (status === "1" && Array.isArray(result) && result.length > 0) {
        const entry = result[0] as Record<string, unknown>;
        const nameTag =
          typeof entry.nametag === "string" && entry.nametag.trim().length
            ? entry.nametag.trim()
            : null;
        const labels = Array.isArray(entry.labels)
          ? entry.labels.filter(
              (l): l is string => typeof l === "string" && l.trim().length > 0
            )
          : [];
        const otherAttributes = Array.isArray(entry.other_attributes)
          ? entry.other_attributes.filter(
              (attr): attr is string => typeof attr === "string" && attr.trim().length > 0
            )
          : [];
        const shortDescription =
          typeof entry.shortdescription === "string" && entry.shortdescription.trim().length
            ? entry.shortdescription.trim()
            : null;
        const notes = [entry.notes_1, entry.notes_2]
          .map((n) => (typeof n === "string" && n.trim().length ? n.trim() : null))
          .filter((n): n is string => Boolean(n));
        const payload = {
          nameTag,
          labels,
          otherAttributes,
          url:
            typeof entry.url === "string" && entry.url.trim().length ? entry.url.trim() : null,
          shortDescription,
          notes: notes.length ? notes : undefined,
        } satisfies AddressTagInfo;
        writeFileSync(path, JSON.stringify(payload, null, 2));
        return payload;
      }

      if (status === "0" && typeof resp.data?.result === "string") {
        const message = resp.data.result;
        if (/rate limit/i.test(message)) {
          logger.warn("Etherscan rate limit hit, retrying address metadata...");
          await sleep(1000 * (attempt + 1));
          continue;
        }

        if (/Missing|unsupported chainid/i.test(message) || /invalid Action name/i.test(message)) {
          logger.debug({ address, chainId, message }, "Address metadata not available for chain");
          break;
        }

        logger.debug({ address, chainId, message }, "Unexpected address metadata response");
        break;
      }

      if (status !== "1") {
        logger.debug({ address, chainId, status, result }, "Unhandled address metadata response");
        break;
      }
    } catch (err) {
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      logger.debug({ address, chainId, err }, "Failed to fetch address metadata; returning empty");
      break;
    }
  }

  const payload = {
    nameTag: null,
    labels: [],
    otherAttributes: [],
    url: null,
    shortDescription: null,
  } satisfies AddressTagInfo;
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return payload;
}

/** Main entry */

import detectProxy from "./lib/evm-proxy-detection/index";
import { ProxyType } from "./lib/evm-proxy-detection/types";

export async function getImplementationAddress(
  provider: JsonRpcProvider,
  address: string
): Promise<string | null> {
  const request = ({ method, params }: { method: string; params: unknown[] }) =>
    provider.send(method, params);

  const res = await detectProxy(address as `0x${string}`, request);
  if (!res) return null;
  if (res.type === ProxyType.Eip2535Diamond) return null;
  return res.target;
}

// (Optional) export the constant if used elsewhere
export { GOVERNOR_PROXY };

export async function getAddressMetadata(
  address: string,
  chainId?: number
): Promise<AddressMetadata> {
  const [nameResult, infoResult] = await Promise.allSettled([
    getContractName(address, chainId),
    getAddressTagInfo(address, chainId),
  ]);

  const metadata: AddressMetadata = {};

  if (nameResult.status === "fulfilled") {
    metadata.contractName = nameResult.value;
  } else {
    logger.debug(
      { address, chainId, err: nameResult.reason },
      "Failed to resolve contract name for address argument"
    );
  }

  if (infoResult.status === "fulfilled") {
    const tagInfo = infoResult.value;
    metadata.labels = tagInfo.labels;
    metadata.url = tagInfo.url ?? undefined;
    metadata.description = tagInfo.shortDescription ?? undefined;
    metadata.notes = tagInfo.notes;

    if (!metadata.etherscanLabel) {
      const labelCandidate = tagInfo.nameTag ?? tagInfo.labels?.[0];
      if (labelCandidate) {
        metadata.etherscanLabel = labelCandidate;
      }
    }

    const contractNameAttr = tagInfo.otherAttributes.find((attr) =>
      typeof attr === "string" && attr.toUpperCase().startsWith("CN:")
    );
    if (!metadata.contractName && contractNameAttr) {
      const extracted = contractNameAttr.split(":").slice(1).join(":").trim();
      if (extracted.length) {
        metadata.contractName = extracted;
      }
    }

    const ensAttr = tagInfo.otherAttributes.find((attr) =>
      typeof attr === "string" && attr.toUpperCase().startsWith("ENS:")
    );
    if (ensAttr) {
      const extracted = ensAttr.split(":").slice(1).join(":").trim();
      if (extracted.length) {
        metadata.ensName = extracted;
      }
    }

    const tokenSymbolAttr = tagInfo.otherAttributes.find((attr) =>
      typeof attr === "string" && attr.toUpperCase().startsWith("TS:")
    );
    if (tokenSymbolAttr) {
      const extracted = tokenSymbolAttr.split(":").slice(1).join(":").trim();
      if (extracted.length) {
        metadata.tokenSymbol = extracted;
      }
    }
  } else {
    logger.debug(
      { address, chainId, err: infoResult.reason },
      "Failed to resolve Etherscan tag for address argument"
    );
  }

  // Fallback to comet-metadata for chains not supported by Etherscan
  if (!metadata.contractName && !metadata.tokenSymbol && chainId) {
    // Try to find as a token/asset
    const assetMeta = getCometAssetMetadata(chainId, address);
    if (assetMeta) {
      metadata.tokenSymbol = assetMeta.symbol;
      if (assetMeta.name) {
        metadata.contractName = assetMeta.name;
      }
    } else {
      // Try to find as a known contract
      const contractLabel = getCometContractLabel(chainId, address);
      if (contractLabel) {
        metadata.contractName = contractLabel;
      }
    }
  }

  return metadata;
}
