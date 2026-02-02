"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Globe, Fuel, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TransactionExecution } from "./transaction-execution";
import { RevertButton } from "./revert-button";
import { getChainName, getChainColor } from "@/lib/chains";
import type { SerializedChainExecutionResult, RevertResultItem } from "@/types/simulator";

interface ChainResultCardProps {
  result: SerializedChainExecutionResult;
  defaultExpanded?: boolean;
}

function formatGas(gas: string | undefined): string {
  if (!gas) return "N/A";
  const num = BigInt(gas);
  return num.toLocaleString();
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Get chain-specific background color
function getChainBgColor(color: string): string {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50",
    green: "bg-green-50",
    yellow: "bg-yellow-50",
    purple: "bg-purple-50",
    orange: "bg-orange-50",
    red: "bg-red-50",
    gray: "bg-slate-100",
  };
  return colorMap[color] ?? "bg-slate-100";
}

function getChainTextColor(color: string): string {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-green-600",
    yellow: "text-yellow-600",
    purple: "text-purple-600",
    orange: "text-orange-600",
    red: "text-red-600",
    gray: "text-slate-600",
  };
  return colorMap[color] ?? "text-slate-600";
}

/**
 * Check if the RPC URL is a Tenderly virtual testnet URL
 */
function isTenderlyUrl(rpcUrl: string): boolean {
  try {
    const url = new URL(rpcUrl);
    return url.hostname.includes("tenderly.co");
  } catch {
    return false;
  }
}

export function ChainResultCard({ result, defaultExpanded = true }: ChainResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [revertMessage, setRevertMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const chainName = getChainName(result.chainId);
  const chainColor = getChainColor(result.chainId);

  const handleRevertComplete = (results: RevertResultItem[]) => {
    const chainResult = results[0];
    if (chainResult?.success) {
      setRevertMessage({ type: "success", text: `Reverted to ${chainResult.snapshotId?.slice(0, 10)}...` });
    } else {
      setRevertMessage({ type: "error", text: chainResult?.error ?? "Revert failed" });
    }
    setTimeout(() => setRevertMessage(null), 5000);
  };

  const handleRevertError = (error: string) => {
    setRevertMessage({ type: "error", text: error });
    setTimeout(() => setRevertMessage(null), 5000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header - Clickable */}
      <div
        className="p-6 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Expand/Collapse icon */}
            <div className="text-slate-400">
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </div>

            {/* Chain icon */}
            <div className={`w-10 h-10 rounded-xl ${getChainBgColor(chainColor)} flex items-center justify-center`}>
              <Globe className={`w-5 h-5 ${getChainTextColor(chainColor)}`} />
            </div>

            {/* Chain name and status */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-900">{chainName}</span>
                <Badge variant={result.success ? "green" : "orange"} className="text-xs">
                  {result.success ? "Success" : "Failed"}
                </Badge>
                {result.persisted && (
                  <Badge variant="gray" className="text-xs">
                    Persisted
                  </Badge>
                )}
              </div>
              <div className="text-sm text-slate-500 mt-0.5">
                {result.executions.length} transaction{result.executions.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Right side info */}
          <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {result.totalGasUsed && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Fuel className="w-4 h-4" />
                <span>{formatGas(result.totalGasUsed)}</span>
              </div>
            )}
            {result.rpcUrl && isTenderlyUrl(result.rpcUrl) && (
              <a
                href={result.rpcUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                title="View on Tenderly"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Tenderly</span>
              </a>
            )}
            {result.persisted && (
              <RevertButton
                chain={result.chain}
                onRevertComplete={handleRevertComplete}
                onRevertError={handleRevertError}
              />
            )}
          </div>
        </div>

        {/* Revert message */}
        {revertMessage && (
          <div
            className={`mt-4 text-sm px-4 py-2 rounded-lg ${
              revertMessage.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {revertMessage.text}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-6 space-y-6">
          {/* Timelock address */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Timelock:</span>
            <code className="font-mono text-slate-700 bg-slate-50 px-2 py-0.5 rounded">
              {truncateAddress(result.timelockAddress)}
            </code>
          </div>

          {/* Transactions */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Transactions</span>
              <span className="text-xs text-slate-400">({result.executions.length})</span>
            </div>
            <div className="space-y-3">
              {result.executions.map((tx) => (
                <TransactionExecution key={tx.index} tx={tx} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
