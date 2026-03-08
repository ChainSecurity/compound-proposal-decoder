"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, XCircle, ExternalLink, Copy, Check, Fuel, AlertTriangle } from "lucide-react";
import type { SerializedTransactionExecution } from "@/types/simulator";

/** 14,000,000 — getting close to block gas limits */
const ETHEREUM_GAS_WARNING_THRESHOLD = 14_000_000;

/** 2^24 = 16,777,216 */
const ETHEREUM_GAS_ALERT_THRESHOLD = 2 ** 24;

interface TransactionExecutionProps {
  tx: SerializedTransactionExecution;
  chainId?: number;
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatGas(gas: string | undefined): string {
  if (!gas) return "N/A";
  const num = BigInt(gas);
  return num.toLocaleString();
}

export function TransactionExecution({ tx, chainId }: TransactionExecutionProps) {
  const [isCalldataExpanded, setIsCalldataExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const value = BigInt(tx.value);
  const hasValue = value > 0n;

  const copyCalldata = () => {
    navigator.clipboard.writeText(tx.calldata);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            tx.success ? "bg-emerald-50" : "bg-orange-50"
          }`}>
            {tx.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-orange-600" />
            )}
          </div>

          {/* Index and status */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">Transaction #{tx.index + 1}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                tx.success
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-orange-100 text-orange-700"
              }`}>
                {tx.success ? "Success" : "Failed"}
              </span>
            </div>
            {tx.txHash && (
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                {truncateHash(tx.txHash)}
              </div>
            )}
          </div>
        </div>

        {/* Gas used */}
        {tx.gasUsed && (
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Fuel className="w-3.5 h-3.5" />
            <span>{formatGas(tx.gasUsed)}</span>
            {chainId === 1 && BigInt(tx.gasUsed) > BigInt(ETHEREUM_GAS_ALERT_THRESHOLD) && (
              <span className="flex items-center gap-1 text-red-600 font-semibold" title="Gas exceeds 2^24 — may be too large for a single block">
                <AlertTriangle className="w-3.5 h-3.5" />
                &gt; 2^24
              </span>
            )}
            {chainId === 1 && BigInt(tx.gasUsed) > BigInt(ETHEREUM_GAS_WARNING_THRESHOLD) && BigInt(tx.gasUsed) <= BigInt(ETHEREUM_GAS_ALERT_THRESHOLD) && (
              <span className="flex items-center gap-1 text-amber-600 font-semibold" title="Gas exceeds 14M — getting close to block gas limits">
                <AlertTriangle className="w-3.5 h-3.5" />
                &gt; 14M
              </span>
            )}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="px-4 pb-4 space-y-3">
        {/* Target */}
        <div className="flex items-start gap-3">
          <span className="text-xs text-slate-500 w-14 shrink-0 pt-0.5">Target</span>
          <code className="font-mono text-xs text-slate-700 break-all bg-white px-2 py-1 rounded border border-slate-200">
            {tx.target}
          </code>
        </div>

        {/* Value (if present) */}
        {hasValue && (
          <div className="flex items-start gap-3">
            <span className="text-xs text-slate-500 w-14 shrink-0 pt-0.5">Value</span>
            <code className="font-mono text-xs text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">
              {value.toString()} wei
            </code>
          </div>
        )}

        {/* Revert reason (if failed) */}
        {tx.revertReason && (
          <div className="flex items-start gap-3">
            <span className="text-xs text-red-500 w-14 shrink-0 pt-0.5">Revert</span>
            <code className="font-mono text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 break-all">
              {tx.revertReason}
            </code>
          </div>
        )}

        {/* Calldata - Expandable */}
        <div className="pt-2">
          <button
            onClick={() => setIsCalldataExpanded(!isCalldataExpanded)}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {isCalldataExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>Calldata</span>
            <span className="text-slate-400">({tx.calldata.length} chars)</span>
          </button>

          {isCalldataExpanded && (
            <div className="mt-2 relative">
              <pre className="p-3 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-600 overflow-x-auto max-h-48">
                {tx.calldata}
              </pre>
              <button
                onClick={copyCalldata}
                className="absolute top-2 right-2 p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                title="Copy calldata"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
