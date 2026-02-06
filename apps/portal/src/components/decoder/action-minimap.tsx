"use client";

import * as React from "react";
import type { SerializedCallNode, CallEdge, Sourced } from "@/types/decoder";
import { isSourced } from "@/types/decoder";

// Helper to unwrap potentially sourced values
function getValue<T>(val: T | Sourced<T>): T {
  return isSourced(val) ? val.value : val;
}

interface ActionMinimapProps {
  calls: SerializedCallNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  reviewedIds?: Set<string>;
}

interface MinimapItem {
  node: SerializedCallNode;
  depth: number;
  id: string;
  edge?: CallEdge;
}

function buildMinimapItems(calls: SerializedCallNode[]): MinimapItem[] {
  const result: MinimapItem[] = [];

  function addChildren(
    children: Array<{ edge: CallEdge; node: SerializedCallNode }>,
    depth: number,
    parentId: string
  ) {
    children.forEach((child, idx) => {
      const id = `${parentId}-${idx}`;
      result.push({
        node: child.node,
        depth,
        id,
        edge: child.edge,
      });

      if (child.node.children && child.node.children.length > 0) {
        addChildren(child.node.children, depth + 1, id);
      }
    });
  }

  calls.forEach((call, idx) => {
    const id = `action-${idx}`;
    result.push({
      node: call,
      depth: 0,
      id,
    });

    if (call.children && call.children.length > 0) {
      addChildren(call.children, 1, id);
    }
  });

  return result;
}

function truncateName(name: string, maxLength: number = 20): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength - 1) + "…";
}

export function ActionMinimap({ calls, activeId, onSelect, reviewedIds }: ActionMinimapProps) {
  const items = React.useMemo(() => buildMinimapItems(calls), [calls]);

  return (
    <nav className="relative">
      {/* Vertical line */}
      <div className="absolute left-[3px] top-2 bottom-2 w-px bg-slate-200" />

      <div className="space-y-1">
        {items.map((item) => {
          const rawCalldata = getValue(item.node.rawCalldata);
          const selector = rawCalldata?.slice(0, 10);
          const isZeroSelector = selector === "0x00000000" || rawCalldata === "0x" || !rawCalldata || rawCalldata.length < 10;
          const isFallbackCall = isZeroSelector && !item.node.decoded?.name;
          const functionName = item.node.decoded?.name
            ? getValue(item.node.decoded.name)
            : isFallbackCall
              ? "Fallback"
              : "Unknown";
          const isActive = item.id === activeId;
          const isTopLevel = item.depth === 0;
          const isReviewed = reviewedIds?.has(item.id) ?? false;

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="w-full text-left group relative"
              style={{ paddingLeft: `${item.depth * 12}px` }}
            >
              <div className="flex items-center gap-3">
                {/* Dot indicator */}
                <div
                  className={`relative z-10 w-[7px] h-[7px] rounded-full border-2 transition-colors ${
                    isReviewed
                      ? "bg-emerald-500 border-emerald-500"
                      : isActive
                        ? "bg-slate-900 border-slate-900"
                        : "bg-white border-slate-300 group-hover:border-slate-400"
                  }`}
                />

                {/* Text */}
                <div className="flex-1 min-w-0 py-1">
                  <div
                    className={`text-sm truncate transition-colors ${
                      isActive
                        ? "text-slate-900 font-medium"
                        : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  >
                    {truncateName(functionName)}
                  </div>
                  {item.edge?.label && (
                    <div className="text-[11px] text-slate-400 truncate">
                      {getValue(item.edge.label)}
                    </div>
                  )}
                  {!item.edge?.label && item.node.targetContractName && isTopLevel && (
                    <div className="text-[11px] text-slate-400 truncate">
                      {getValue(item.node.targetContractName)}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Helper to get all IDs for intersection observer
export function getAllActionIds(calls: SerializedCallNode[]): string[] {
  return buildMinimapItems(calls).map((item) => item.id);
}
