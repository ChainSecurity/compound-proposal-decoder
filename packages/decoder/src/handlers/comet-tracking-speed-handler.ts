import { Interface, JsonRpcProvider, formatUnits } from "ethers";
import { checksum } from "@/utils";
import { getAbiFor, getImplementationAddress, getProviderFor } from "@/ethers";
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

function formatCometLabel(chainId: number, comet: string): string {
  const metadata = getCometMetadata(chainId, comet);
  if (!metadata) return comet;
  const label = metadata.name ? `${metadata.name} (${metadata.symbol})` : metadata.symbol;
  return `${label} • ${comet}`;
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
            { label: "Comet", value: formatCometLabel(ctx.chainId, cometProxy) },
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
            { label: "Comet", value: formatCometLabel(ctx.chainId, cometProxy) },
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
            { label: "Comet", value: formatCometLabel(ctx.chainId, cometProxy) },
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
      { label: "Comet", value: formatCometLabel(ctx.chainId, cometProxy) },
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
