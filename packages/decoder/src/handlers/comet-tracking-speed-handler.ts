import { Interface, JsonRpcProvider, formatUnits } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor, getEtherscanTokenInfo, longestSymbol } from "@/ethers";
import { insight, selectorOfSig, type Handler, type InsightRequest } from "@/registry";
import { logger } from "@/logger";
import { getCometMetadata } from "@/lib/comet-metadata";
import { handlerSource } from "@/types/sources";

const HANDLER_NAME = "comet-tracking-speed-handler";

const SET_BASE_TRACKING_SUPPLY_SPEED_SIG = "setBaseTrackingSupplySpeed(address,uint64)";
const SET_BASE_TRACKING_SUPPLY_SPEED_SELECTOR = selectorOfSig(SET_BASE_TRACKING_SUPPLY_SPEED_SIG);

const SET_BASE_TRACKING_BORROW_SPEED_SIG = "setBaseTrackingBorrowSpeed(address,uint64)";
const SET_BASE_TRACKING_BORROW_SPEED_SELECTOR = selectorOfSig(SET_BASE_TRACKING_BORROW_SPEED_SIG);

function getProviderSafe(chainId: number): JsonRpcProvider | null {
  try {
    return getProviderFor(chainId);
  } catch (err) {
    logger.debug({ chainId, err }, "Comet tracking speed insights skipped: missing provider");
    return null;
  }
}

async function getCometInterface(
  chainId: number,
  cometProxy: string,
  provider: JsonRpcProvider
): Promise<Interface | null> {
  try {
    const implementation = (await getImplementationAddress(provider, cometProxy)) ?? cometProxy;
    return (await getAbiFor(implementation, chainId)) ?? null;
  } catch (err) {
    logger.debug({ chainId, cometProxy, err }, "Failed to load Comet ABI");
    return null;
  }
}

const ERC20_INFO_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const COMET_BASE_TOKEN_ABI = ["function baseToken() view returns (address)"];

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenTag(symbol: string | null, decimals: number | null): string | null {
  if (!symbol) return null;
  const dec = decimals !== null ? ` (${decimals} dec.)` : "";
  return `${symbol}${dec}`;
}

async function fetchTokenInfo(chainId: number, address: string, staticSymbol?: string | null): Promise<{ symbol: string | null; decimals: number | null }> {
  // Try explorer page for precise ticker (e.g. "USDC.e" not "USDC")
  const explorerToken = await getEtherscanTokenInfo(address, chainId);
  const bestStatic = explorerToken.symbol ?? staticSymbol ?? null;

  try {
    const provider = getProviderFor(chainId);
    const iface = new Interface(ERC20_INFO_ABI);
    const [symRes, decRes] = await Promise.allSettled([
      provider.call({ to: address, data: iface.encodeFunctionData("symbol") }),
      provider.call({ to: address, data: iface.encodeFunctionData("decimals") }),
    ]);
    const onChainSymbol = symRes.status === "fulfilled"
      ? (iface.decodeFunctionResult("symbol", symRes.value)[0] as string)
      : null;
    const decimals = decRes.status === "fulfilled"
      ? Number(iface.decodeFunctionResult("decimals", decRes.value)[0])
      : null;
    // Pick the longest symbol (longer ≈ more informative, e.g. "USDC.e" > "USDC")
    const symbol = longestSymbol(bestStatic, onChainSymbol);
    return { symbol, decimals };
  } catch {
    return { symbol: bestStatic, decimals: null };
  }
}

async function fetchBaseTokenTag(chainId: number, cometProxy: string): Promise<string | null> {
  try {
    const provider = getProviderFor(chainId);
    const iface = new Interface(COMET_BASE_TOKEN_ABI);
    const result = await provider.call({ to: cometProxy, data: iface.encodeFunctionData("baseToken") });
    const [baseTokenAddr] = iface.decodeFunctionResult("baseToken", result);
    if (!baseTokenAddr || typeof baseTokenAddr !== "string") return null;
    const { symbol, decimals } = await fetchTokenInfo(chainId, baseTokenAddr);
    return formatTokenTag(symbol, decimals);
  } catch {
    return null;
  }
}

async function formatCometLabel(chainId: number, comet: string): Promise<string> {
  const metadata = getCometMetadata(chainId, comet);
  if (metadata) {
    const label = metadata.name ? `${metadata.name} (${metadata.symbol})` : metadata.symbol;
    let baseTag: string | null = null;
    if (metadata.baseTokenAddress) {
      const { symbol, decimals } = await fetchTokenInfo(chainId, metadata.baseTokenAddress, metadata.baseTokenSymbol);
      baseTag = formatTokenTag(symbol, decimals);
    } else if (metadata.baseTokenSymbol) {
      baseTag = metadata.baseTokenSymbol;
    }
    const basePart = baseTag ? ` • base: ${baseTag}` : "";
    return `${label}${basePart} • ${shortAddr(comet)}`;
  }
  const { symbol, decimals } = await fetchTokenInfo(chainId, comet);
  const cometTag = formatTokenTag(symbol, decimals) ?? shortAddr(comet);
  const baseTag = await fetchBaseTokenTag(chainId, comet);
  const basePart = baseTag ? ` • base: ${baseTag}` : "";
  return `${cometTag}${basePart} • ${shortAddr(comet)}`;
}

function formatRate(value: bigint): string {
  try {
    return `${formatUnits(value, 18)} (raw ${value.toString()})`;
  } catch {
    return value.toString();
  }
}

export const cometTrackingSpeedHandler: Handler = {
  name: "Comet tracking speed insights",
  match: (ctx) => {
    if (!ctx.rawCalldata || ctx.rawCalldata.length < 10) return false;
    const selector = ctx.rawCalldata.slice(0, 10);
    return (
      selector === SET_BASE_TRACKING_SUPPLY_SPEED_SELECTOR ||
      selector === SET_BASE_TRACKING_BORROW_SPEED_SELECTOR
    );
  },
  expand: async (ctx) => {
    const selector = ctx.rawCalldata.slice(0, 10);
    if (!ctx.parsed) return [];

    const insights: InsightRequest[] = [];
    const [cometProxyArg, newSpeedArg] = ctx.parsed.args ?? [];
    if (!cometProxyArg || newSpeedArg === undefined) return insights;

    const cometProxy = checksum(String(cometProxyArg));
    const newSpeed = typeof newSpeedArg === "bigint" ? newSpeedArg : BigInt(String(newSpeedArg));

    const provider = getProviderSafe(ctx.chainId);
    if (!provider) {
      insights.push(
        insight({
          title: "Tracking Speed Update (No RPC)",
          entries: [
            { label: "Comet", value: await formatCometLabel(ctx.chainId, cometProxy) },
            { label: "New Speed", value: newSpeed.toString() },
            { label: "Status", value: "Configure RPC to fetch trackingIndexScale" },
          ],
          _handlerSource: handlerSource(HANDLER_NAME),
        })
      );
      return insights;
    }

    const cometIface = await getCometInterface(ctx.chainId, cometProxy, provider);
    if (!cometIface) {
      insights.push(
        insight({
          title: "Tracking Speed Update (ABI Missing)",
          entries: [
            { label: "Comet", value: await formatCometLabel(ctx.chainId, cometProxy) },
            { label: "New Speed", value: newSpeed.toString() },
            { label: "Status", value: "Comet ABI missing" },
          ],
          _handlerSource: handlerSource(HANDLER_NAME),
        })
      );
      return insights;
    }

    let trackingIndexScale: bigint | undefined;
    try {
      // The `trackingIndexScale` function does not accept any arguments.
      const trackingIndexScaleData = cometIface.encodeFunctionData("trackingIndexScale", []);
      const rawTrackingIndexScale = await provider.call({ to: cometProxy, data: trackingIndexScaleData });
      const decodedTrackingIndexScale = cometIface.decodeFunctionResult("trackingIndexScale", rawTrackingIndexScale);
      trackingIndexScale = BigInt(decodedTrackingIndexScale[0]);
    } catch (err) {
      logger.debug({ cometProxy, err }, "Failed to read trackingIndexScale");
      insights.push(
        insight({
          title: "Tracking Speed Update (Failed to get trackingIndexScale)",
          entries: [
            { label: "Comet", value: await formatCometLabel(ctx.chainId, cometProxy) },
            { label: "New Speed", value: newSpeed.toString() },
            { label: "Status", value: `Failed to get trackingIndexScale: ${err}` },
          ],
          _handlerSource: handlerSource(HANDLER_NAME),
        })
      );
      return insights;
    }

    const isSupply = selector === SET_BASE_TRACKING_SUPPLY_SPEED_SELECTOR;
    const speedFunctionName = isSupply ? "baseTrackingSupplySpeed" : "baseTrackingBorrowSpeed";

    let oldSpeed: bigint | undefined;
    try {
      const oldSpeedData = cometIface.encodeFunctionData(speedFunctionName, []);
      const rawOldSpeed = await provider.call({ to: cometProxy, data: oldSpeedData });
      const decodedOldSpeed = cometIface.decodeFunctionResult(speedFunctionName, rawOldSpeed);
      oldSpeed = BigInt(decodedOldSpeed[0]);
    } catch (err) {
      logger.debug({ cometProxy, err }, `Failed to read ${speedFunctionName}`);
      // If we can't get the old speed, we can still proceed with the rest.
    }

    const SCALING_FACTOR = 3600n * 24n; // seconds in a day
    const newScaledSpeed = (newSpeed * SCALING_FACTOR * 1000000000000000000n) / trackingIndexScale;

    const entries = [
      { label: "Comet", value: await formatCometLabel(ctx.chainId, cometProxy) },
      { label: "Tracking Index Scale", value: `${formatUnits(trackingIndexScale, 18)} (raw ${trackingIndexScale.toString()})` },
    ];

    if (oldSpeed !== undefined) {
      const oldScaledSpeed = (oldSpeed * SCALING_FACTOR * 1000000000000000000n) / trackingIndexScale;
      entries.push(
        { label: "Old Raw Speed (per second)", value: oldSpeed.toString() },
        { label: "Old Scaled Speed per day", value: `${formatUnits(oldScaledSpeed, 18)} (raw ${oldScaledSpeed.toString()})` }
      );
    }

    entries.push(
      { label: "New Raw Speed (per second)", value: newSpeed.toString() },
      { label: "New Scaled Speed per day", value: `${formatUnits(newScaledSpeed, 18)} (raw ${newScaledSpeed.toString()})` }
    );

    insights.push(
      insight({
        title: isSupply
          ? "Set Base Tracking Supply Speed"
          : "Set Base Tracking Borrow Speed",
        entries,
        _handlerSource: handlerSource(HANDLER_NAME, "Fetched trackingIndexScale and speed from Comet contract"),
      })
    );

    return insights;
  },
};
