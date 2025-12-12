import { Interface, FunctionFragment, ParamType, keccak256, toUtf8Bytes } from "ethers";
import { logger } from "./logger.js";

import {
  getProviderFor,
  callProposalDetails,
  getAbiFor,
  getImplementationAddress,
  getContractName,
  getAddressMetadata,
  GOVERNOR_PROXY,
} from "@/ethers.js";

import { checksum, toReadableArg } from "./utils.js";
import type {
  AddressMetadata,
  CallNode,
  DecodedFunction,
  DecodedProposal,
  ProposalDetails,
} from "./types.js";
import { Registry } from "./registry.js";
import { lineaBridgeHandler } from "./handlers/linea-bridge-handler.js";
import { lineaBridgeReceiverHandler } from "./handlers/linea-receiver-handler.js";
import { scrollBridgeHandler } from "./handlers/scroll-bridge-handler.js";
import { scrollBridgeReceiverHandler } from "./handlers/scroll-receiver-handler.js";
import { opCrossDomainMessengerHandler } from "./handlers/op-cdm-handler.js";
import { opReceiverHandler } from "./handlers/op-receiver-handler.js";
import { arbitrumRetryableHandler } from "./handlers/arbitrum-inbox-handler.js";
import { arbitrumReceiverHandler } from "./handlers/arbitrum-receiver-handler.js";
import { polygonFxRootHandler } from "./handlers/polygon-fxroot-handler.js";
import { polygonReceiverHandler } from "./handlers/polygon-receiver-handler.js";
import { cometConfiguratorInsightsHandler } from "./handlers/comet-configurator-insights.js";
import { cometConfiguratorPriceFeedInsightsHandler } from "./handlers/comet-configurator-price-feed-insights.js";
import { cometTrackingSpeedHandler } from "./handlers/comet-tracking-speed-handler.js";

// ---------------------- Constants ----------------------

const ETHEREUM_MAINNET_CHAIN_ID = 1;

// Build the registry once (add more handlers as you implement them)
const registry = new Registry().use([
  lineaBridgeHandler,
  lineaBridgeReceiverHandler,
  scrollBridgeHandler,
  scrollBridgeReceiverHandler,
  opCrossDomainMessengerHandler,
  opReceiverHandler,
  arbitrumRetryableHandler,
  arbitrumReceiverHandler,
  polygonFxRootHandler,
  polygonReceiverHandler,
  cometConfiguratorInsightsHandler,
  cometConfiguratorPriceFeedInsightsHandler,
  cometTrackingSpeedHandler,
]);

// ---------------------- Small helpers ----------------------

function selectorOf(data: string): string {
  if (!data || data === "0x") return "0x00000000";
  return data.slice(0, 10);
}

function fragmentSignature(fn: FunctionFragment): string {
  return `${fn.name}(${fn.inputs.map((p: ParamType) => p.format("full")).join(",")})`;
}

function decodeWithInterface(iface: Interface, calldata: string): DecodedFunction | undefined {
  try {
    const parsed = iface.parseTransaction({ data: calldata });
    if (!parsed) return undefined;

    const fn = iface.getFunction(parsed.selector);
    if (!fn) return undefined;

    const rawArgs = Array.from(parsed.args);

    return {
      name: parsed.name,
      signature: fragmentSignature(fn),
      selector: selectorOf(calldata),
      args: parsed.args.map(toReadableArg),
      argTypes: fn.inputs.map((i: ParamType) => i.format("full")),
      argParams: fn.inputs as ParamType[],
      rawArgs,
    };
  } catch {
    return undefined;
  }
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function asChecksumAddress(value: unknown): string | null {
  if (typeof value === "string") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
    try {
      return checksum(value);
    } catch {
      return null;
    }
  }

  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof (value as { toString(): unknown }).toString === "function"
  ) {
    const asString = String((value as { toString(): string }).toString());
    if (!/^0x[0-9a-fA-F]{40}$/.test(asString)) return null;
    try {
      return checksum(asString);
    } catch {
      return null;
    }
  }

  return null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && "length" in value) {
    try {
      return Array.from(value as unknown as Iterable<unknown>);
    } catch {
      return [];
    }
  }
  return [];
}

function collectAddressesFromParam(
  param: ParamType,
  value: unknown,
  acc: Set<string>
): void {
  if (!param) return;

  if (param.baseType === "address") {
    const addr = asChecksumAddress(value);
    if (addr && addr !== ZERO_ADDRESS) {
      acc.add(addr);
    }
    return;
  }

  if (param.baseType === "array" && param.arrayChildren) {
    const values = toArray(value);
    for (const item of values) {
      collectAddressesFromParam(param.arrayChildren, item, acc);
    }
    return;
  }

  if (param.baseType === "tuple" && param.components) {
    if (!value || typeof value !== "object") return;
    const arrayValue = Array.isArray(value) ? value : undefined;
    param.components.forEach((component, index) => {
      const tupleValue =
        arrayValue?.[index] ?? (value as Record<string | number, unknown>)[component.name] ?? (value as Record<string | number, unknown>)[index];
      collectAddressesFromParam(component, tupleValue, acc);
    });
  }
}

async function resolveAddressMetadataForArgs(
  chainId: number,
  params: ParamType[],
  rawArgs: unknown[] | undefined
): Promise<Record<string, AddressMetadata>> {
  if (!rawArgs || !rawArgs.length || !params.length) return {};

  const addresses = new Set<string>();
  params.forEach((param, index) => {
    collectAddressesFromParam(param, rawArgs[index], addresses);
  });

  if (!addresses.size) return {};

  let provider: ReturnType<typeof getProviderFor> | null = null;
  try {
    provider = getProviderFor(chainId);
  } catch (err) {
    logger.debug({ chainId, err }, "Failed to acquire provider for address metadata enrichment");
  }

  const metadataEntries = await Promise.all(
    Array.from(addresses).map(async (address) => {
      try {
        const info: AddressMetadata = await getAddressMetadata(address, chainId);

        if (provider) {
          try {
            const implementationAddr = await getImplementationAddress(provider, address);
            if (implementationAddr && implementationAddr !== address) {
              const implMeta = await getAddressMetadata(implementationAddr, chainId);
              info.implementation = {
                address: implementationAddr,
                contractName: implMeta.contractName,
                etherscanLabel: implMeta.etherscanLabel,
                tokenSymbol: implMeta.tokenSymbol,
                labels: implMeta.labels,
                ensName: implMeta.ensName,
              };
            }
          } catch (err) {
            logger.debug({ address, chainId, err }, "Failed to resolve proxy implementation for address argument");
          }
        }

        if (
          !info.contractName &&
          !info.etherscanLabel &&
          !info.tokenSymbol &&
          !info.implementation
        ) {
          return null;
        }
        return [address, info] as [string, AddressMetadata];
      } catch (err) {
        logger.debug({ address, chainId, err }, "Failed to resolve metadata for address argument");
        return null;
      }
    })
  );

  const metadata: Record<string, AddressMetadata> = {};
  for (const entry of metadataEntries) {
    if (!entry) continue;
    metadata[entry[0]] = entry[1];
  }

  return metadata;
}

// pick selected args by name
function pickArgs(
  decoded: { argParams: ParamType[]; rawArgs: unknown[] },
  names: string[],
) {
  const set = new Set(names);
  const argParams: ParamType[] = [];
  const rawArgs: unknown[] = [];
  decoded.argParams.forEach((p, i) => {
    if (set.has(p.name)) {
      argParams.push(p);
      rawArgs.push(decoded.rawArgs[i]);
    }
  });
  return { argParams, rawArgs };
}

// ---------------------- Core decoding ----------------------

/**
 * Decode a single call on a given chainId.
 * - Decodes ABI (if available)
 * - Detects/expands children via registry (bridges, multicalls, etc.)
 * - Recurses into children with their own chainId
 */
async function decodeActionCall(
  ctx: { chainId: number },
  target: string,
  value: bigint,
  data: string
): Promise<CallNode> {
  const chainId = ctx.chainId;
  const targetCS = checksum(target);
  logger.debug({ chainId, target, value, data }, "Decoding action call");

  const node: CallNode = {
    chainId,
    target: targetCS,
    targetContractName: (await getContractName(targetCS, chainId)) ?? undefined,
    valueWei: value,
    rawCalldata: data,
    notes: [],
  };

  // Trivial case: no calldata at all
  if (!data || data === "0x") {
    node.notes!.push("empty calldata (possible ETH transfer or fallback)");
    logger.debug("Empty calldata, returning");
    return node;
  }

  // Try to decode using ABI for this chain
  let iface: Interface | undefined;
  try {
    logger.debug(`Checking for proxy implementation for ${targetCS} on chain ${chainId}`);
    const impl = await getImplementationAddress(getProviderFor(chainId), targetCS);
    if (impl && impl !== targetCS) {
      const implName = await getContractName(impl, chainId);
      node.implementation = impl;
      node.implementationContractName = implName || undefined;
      iface = (await getAbiFor(impl, chainId)) ?? undefined;
      logger.debug({ proxy: targetCS, implementation: impl }, "Using implementation ABI");
    } else {
      logger.debug(`No proxy detected for ${targetCS} on chain ${chainId}`);
      iface = (await getAbiFor(targetCS, chainId)) ?? undefined;
    }
  } catch (err: unknown) {
    logger.warn(
      err,
      `Error checking proxy for ${targetCS} on chain ${chainId}; falling back to target ABI`
    );
    iface = (await getAbiFor(targetCS, chainId)) ?? undefined;
  }

  if (iface) {
    const decoded = decodeWithInterface(iface, data);
    if (decoded) {
      node.decoded = decoded;
      logger.debug({ signature: decoded.signature }, "Decoded function call");
    }
  }

  // Ask the registry if this call should expand into children (bridge, multicall, etc.)
  const expansion = await registry.apply({
    chainId,
    target: targetCS,
    valueWei: value,
    rawCalldata: data,
    parsed: node.decoded
      ? {
          iface: iface as Interface,
          selector: node.decoded.selector,
          name: node.decoded.name,
          args: node.decoded.args,
        }
      : undefined,
  });

  if (expansion.insights.length) {
    node.insights = expansion.insights.map((i) => i.insight);
  }

  if (expansion.children.length) {
    logger.debug({ count: expansion.children.length }, "Expanding children");
    node.children = [];
    for (const cr of expansion.children) {
      const childNode = await decodeActionCall(
        { chainId: cr.nodeInput.chainId },
        cr.nodeInput.target,
        cr.nodeInput.valueWei ?? 0n,
        cr.nodeInput.rawCalldata
      );
      node.children.push({ edge: cr.edge, node: childNode });
    }
  }

  // Resolve metadata possibly on a different chain for bridges or gateways
  let effectiveChainId = chainId;

  // Define bridge contracts and their special handling
  const BRIDGE_CONTRACTS = {
    '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f': 'createRetryableTicket', // Arbitrum
    '0xd19d4B5d358258f05D7B411E21A1460D11B0876F': 'sendMessage', // Linea
    '0x9A3D64E386C18Cb1d6d5179a9596A4B5736e98A6': 'sendMessage', // Unichain
    '0x676A795fe6E43C17c668de16730c3F690FEB7120': 'sendMessage', // Mantle
    '0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1': 'sendMessage', // Optimism
    '0x6774Bcbd5ceCeF1336b5300fb5186a12DDD8b367': 'sendMessage', // Scroll
    '0x866E82a600A1414e583f7F13623F1aC5d58b0Afa': 'sendMessage', // Base
    '0xfe5e5D361b2ad62c541bAb87C45a0B9B018389a2': 'sendMessageToChild', // Polygon
  } as const;

  // Token gateways with fixed destination chain and arg roles
  const TOKEN_GATEWAYS: Record<string, {
    method: string;
    dstChainId: number;
    srcArgNames: string[];
    dstArgNames: string[];
  }> = {
     '0xA5874756416Fa632257eEA380CAbd2E87cED352A': {
       method: 'bridgeERC20To',
       dstChainId: 8453,
       srcArgNames: ['_localToken'],
       dstArgNames: ['_remoteToken', '_to'],
     },
     '0x504A330327A089d8364C4ab3811Ee26976d388ce': {
       method: 'depositTo',
       dstChainId: 59144,
       srcArgNames: [],
       dstArgNames: ['to'],
     },
     '0x051F1D88f0aF5763fB888eC4378b4D8B29ea3319': {
       method: 'bridgeToken',
       dstChainId: 59144,
       srcArgNames: ['_token'],
       dstArgNames: ['_recipient'],
     },
  };

  // Bridge detection to set effectiveChainId
  if (expansion.children.length && node.decoded?.name && targetCS) {
    const expectedMethod = BRIDGE_CONTRACTS[targetCS as keyof typeof BRIDGE_CONTRACTS];
    if (expectedMethod && node.decoded.name === expectedMethod) {
      effectiveChainId = expansion.children[0].nodeInput.chainId;
      logger.debug('Detected bridge transaction. Effective ChainId:', effectiveChainId);
    }
  }

  // Metadata enrichment path selection
  if (node.decoded) {
    const gw = TOKEN_GATEWAYS[targetCS as keyof typeof TOKEN_GATEWAYS];

    if (gw && node.decoded.name === gw.method) {
      const srcPart = pickArgs(node.decoded, gw.srcArgNames);
      const dstPart = pickArgs(node.decoded, gw.dstArgNames);

      try {
        const [srcMeta, dstMeta] = await Promise.all([
          resolveAddressMetadataForArgs(chainId, srcPart.argParams, srcPart.rawArgs),
          resolveAddressMetadataForArgs(gw.dstChainId, dstPart.argParams, dstPart.rawArgs),
        ]);
        const merged = { ...srcMeta, ...dstMeta };
        if (Object.keys(merged).length) node.decoded.addressMetadata = merged;
      } catch (err) {
        logger.debug({ err, chainId, dstChainId: gw.dstChainId, target: targetCS }, "Failed token gateway enrichment");
      }
    } else {
      try {
        const addressMetadata = await resolveAddressMetadataForArgs(
          effectiveChainId,
          node.decoded.argParams,
          node.decoded.rawArgs
        );
        if (Object.keys(addressMetadata).length) {
          node.decoded.addressMetadata = addressMetadata;
        }
      } catch (err) {
        logger.debug({ err, chainId, target: targetCS }, "Failed to enrich address metadata");
      }
    }
  }

  if (!node.decoded) {
    // if zero selector, skip the warning about ABI
    if (selectorOf(data) === "0x00000000") {
      if (node.children) {
        node.notes!.push("zero selector; but handler decoded");
      } else {
        node.notes!.push("zero selector; cannot decode; you may need to implement a handler");
      }
    } else if (iface) {
      if (node.children) {
        node.notes!.push("unknown function selector; but handler decoded");
        logger.warn(
          { selector: selectorOf(data), target: targetCS },
          "Function selector not in ABI, but handler decoded"
        );
      } else {
        node.notes!.push(
          "unknown function selector; cannot decode; you may need to implement a new proxy detector or a handler"
        );
        logger.warn(
          { selector: selectorOf(data), target: targetCS },
          "Function selector not in ABI"
        );
      }
    } else {
      node.notes!.push("ABI not available (unverified or failed fetch); cannot decode selector");
      logger.warn({ address: targetCS }, "ABI not available");
    }
  }

  return node;
}

// ---------------------- Proposal driver ----------------------

export async function decodeProposalFromCalldata(calldata: string): Promise<DecodedProposal> {
  const proposeInterface = new Interface([
    "function propose(address[] targets, uint256[] amounts, bytes[] calldatas, string description)",
  ]);

  try {
    const decodedArgs = proposeInterface.decodeFunctionData("propose", calldata);

    const targets = decodedArgs.targets as string[];
    const values = decodedArgs.amounts as bigint[];
    const calldatas = decodedArgs.calldatas as string[];
    const description = decodedArgs.description as string;

    const descriptionHash = keccak256(toUtf8Bytes(description));

    const details: ProposalDetails = {
      targets,
      values,
      calldatas,
      descriptionHash,
    };

    logger.debug(details, "Decoded proposal details from calldata");

    return decodeProposalFromDetails(details, {});
  } catch (error) {
    logger.error(error, "Failed to decode calldata");
    throw new Error(
      "Failed to decode calldata. Please ensure it is valid for `propose(address[],uint256[],bytes[],string)`."
    );
  }
}

export type ProposalMetadata = {
  governor?: string;
  proposalId?: bigint;
  chainId?: number;
};

export async function decodeProposalFromDetails(
  details: ProposalDetails,
  metadata: ProposalMetadata = {}
): Promise<DecodedProposal> {
  const chainId = metadata.chainId ?? ETHEREUM_MAINNET_CHAIN_ID;
  const governor = metadata.governor ? checksum(metadata.governor) : checksum(GOVERNOR_PROXY);
  const proposalId = metadata.proposalId ?? 0n;

  const { targets, values, calldatas, descriptionHash } = details;

  if (!(targets.length === values.length && values.length === calldatas.length)) {
    throw new Error("Proposal details arrays must have equal length");
  }

  const calls: CallNode[] = [];
  for (let i = 0; i < targets.length; i++) {
    const node = await decodeActionCall({ chainId }, targets[i]!, values[i]!, calldatas[i]!);
    calls.push(node);
  }

  return { governor, proposalId, descriptionHash, calls };
}

export async function decodeProposal(proposalIdNum: number): Promise<DecodedProposal> {
  logger.info(`Decoding proposal ${proposalIdNum}`);
  const provider = getProviderFor(ETHEREUM_MAINNET_CHAIN_ID);
  const governor = checksum(GOVERNOR_PROXY);
  const proposalId = BigInt(proposalIdNum);

  try {
    const details = await callProposalDetails(provider, governor, proposalId);
    logger.debug(details, "Got proposal details");

    const decoded = await decodeProposalFromDetails(details, { governor, proposalId });
    logger.info("Finished decoding proposal");
    return decoded;
  } catch (err: unknown) {
    if (err instanceof Error && /execution reverted/.test(err.message)) {
      throw new Error(`Governor contract call reverted; ensure proposalId ${proposalId} exists`);
    }
    throw err;
  }
}