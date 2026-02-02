import { Interface, id } from "ethers";
import { checksum } from "@/utils";
import type { CallEdge, CallInsight, DecoderOptions } from "@/types";
import { logger } from "@/logger";

/** What your action-level decoder passes into the registry */
export type RegistryCtx = {
  // where this call executes
  chainId: number;

  // call data
  target: string;
  valueWei: bigint;
  rawCalldata: string;

  // optional parsed info if you decoded the top-level already
  // (handlers may ignore this and parse again with their own minimal ABI)
  parsed?:
    | {
        iface: Interface;
        selector: string; // 0x....
        name?: string;
        args?: unknown[];
      }
    | undefined;

  // decoder options (for source tracking, etc.)
  options?: DecoderOptions;
};

/** What a handler asks the main decoder to recurse into */
export type ChildRequest = {
  edge: CallEdge; // how we got this child (bridge/multicall/etc.)
  nodeInput: {
    chainId: number;
    target: string;
    valueWei?: bigint; // default 0n
    rawCalldata: string;
  };
};

export type InsightRequest = {
  kind: "insight";
  insight: CallInsight;
};

type HandlerExpandResult =
  | Array<ChildRequest | InsightRequest>
  | {
      children?: ChildRequest[];
      insights?: InsightRequest[];
    };

export type Handler = {
  name: string;
  /**
   * Return true if this handler applies to the current call.
   * Inspect address, selector, chain, parsed function name, etc.
   */
  match: (ctx: RegistryCtx) => boolean;
  /**
   * Return one or more child calls to decode recursively.
   * Keep it pure: don't mutate ctx. If nothing to expand, return [].
   */
  expand: (ctx: RegistryCtx) => HandlerExpandResult | Promise<HandlerExpandResult>;
};

export class Registry {
  private handlers: Handler[] = [];

  use(handler: Handler[]): this {
    this.handlers.push(...handler);
    return this;
  }

  /** Iterate handlers and collect ALL expansions (so multicall + bridge could both apply). */
  async apply(ctx: RegistryCtx): Promise<{ children: ChildRequest[]; insights: InsightRequest[] }> {
    const childrenOut: ChildRequest[] = [];
    const insightsOut: InsightRequest[] = [];
    for (const h of this.handlers) {
      try {
        logger.trace({ handler: h.name , target: ctx.target}, "Trying to match handler");
        if (!h.match(ctx)) continue;
        logger.trace({ handler: h.name }, "Handler matched");
        const expansion = await h.expand(ctx);
        const { children, insights } = normalizeExpansion(expansion);
        if (children.length) {
          logger.trace({ handler: h.name, count: children.length }, "Handler expanded children");
          childrenOut.push(...children);
        }
        if (insights.length) {
          logger.trace({ handler: h.name, count: insights.length }, "Handler produced insights");
          insightsOut.push(...insights);
        }
      } catch (err) {
        // Swallow handler errors; parent decoder can surface a note if desired.
        // You could also push a synthetic note via a special edge.type === "other".
        logger.warn({ handler: h.name, err }, "Handler failed");
        continue;
      }
    }
    return { children: childrenOut, insights: insightsOut };
  }
}

function normalizeExpansion(expansion: HandlerExpandResult | undefined | null): {
  children: ChildRequest[];
  insights: InsightRequest[];
} {
  if (!expansion) return { children: [], insights: [] };
  if (Array.isArray(expansion)) {
    const children: ChildRequest[] = [];
    const insights: InsightRequest[] = [];
    for (const item of expansion) {
      if (!item) continue;
      if ((item as InsightRequest).kind === "insight") {
        insights.push(item as InsightRequest);
      } else {
        children.push(item as ChildRequest);
      }
    }
    return { children, insights };
  }
  const { children = [], insights = [] } = expansion;
  return { children, insights };
}

/** Convenience: compute a selector from a canonical signature string */
export const selectorOfSig = (sig: string) => id(sig).slice(0, 10);

/** Quick utility for building a minimal decode result for a child */
export function child(
  edge: CallEdge,
  opts: { chainId: number; target: string; rawCalldata: string; valueWei?: bigint }
): ChildRequest {
  return {
    edge,
    nodeInput: {
      chainId: opts.chainId,
      target: checksum(opts.target),
      rawCalldata: opts.rawCalldata,
      valueWei: opts.valueWei ?? 0n,
    },
  };
}

/** Helper for building an insight request */
export function insight(ins: CallInsight): InsightRequest {
  return { kind: "insight", insight: ins };
}
