"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Radio,
  XCircle,
  AlertCircle,
  Activity,
  Layers,
} from "lucide-react";
import type { TrackingResult, BatchTrackingResult, CrossChainActionResult } from "@/types/tracker";
import { GovernorState } from "@/types/tracker";

// --- Input parsing ---
function parseInput(input: string): number[] {
  const trimmed = input.trim();
  const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start > end) throw new Error(`Invalid range "${trimmed}": start must be ≤ end`);
    if (end - start + 1 > 200) throw new Error(`Range too large: max 200 proposals at once`);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  if (/^\d+$/.test(trimmed)) {
    return [Number(trimmed)];
  }
  throw new Error(`Invalid input "${trimmed}": expected a number or range (e.g., 446-526)`);
}

// --- Explorer URL helpers (mirroring packages/tracker/src/explorer.ts) ---
const EXPLORER_BASE_URLS: Record<number, string> = {
  1: "https://etherscan.io",
  10: "https://optimistic.etherscan.io",
  137: "https://polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
  59144: "https://lineascan.build",
  534352: "https://scrollscan.com",
  5000: "https://mantlescan.xyz",
  130: "https://unichain.blockscout.com",
  2020: "https://app.roninchain.com",
};

function getTxUrl(chainId: number, txHash: string): string | undefined {
  const base = EXPLORER_BASE_URLS[chainId];
  return base ? `${base}/tx/${txHash}` : undefined;
}

// --- Governor state helpers ---
function governorStateLabel(state: GovernorState | undefined): string {
  if (state === undefined) return "Unknown";
  return GovernorState[state] ?? `State ${state}`;
}

function governorStateColor(state: GovernorState | undefined): string {
  if (state === undefined) return "text-slate-500 bg-slate-50 border-slate-200";
  switch (state) {
    case GovernorState.Executed:
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case GovernorState.Active:
      return "text-blue-700 bg-blue-50 border-blue-200";
    case GovernorState.Queued:
      return "text-amber-700 bg-amber-50 border-amber-200";
    case GovernorState.Succeeded:
      return "text-teal-700 bg-teal-50 border-teal-200";
    case GovernorState.Pending:
      return "text-slate-700 bg-slate-50 border-slate-200";
    case GovernorState.Defeated:
    case GovernorState.Canceled:
    case GovernorState.Expired:
      return "text-red-700 bg-red-50 border-red-200";
    default:
      return "text-slate-700 bg-slate-50 border-slate-200";
  }
}

// --- Cross-chain status helpers ---
type CrossChainStatus = "not-transmitted" | "pending" | "executed" | "expired";

function statusIcon(status: CrossChainStatus) {
  switch (status) {
    case "executed":
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    case "pending":
      return <Clock className="w-4 h-4 text-amber-500" />;
    case "not-transmitted":
      return <Radio className="w-4 h-4 text-slate-400" />;
    case "expired":
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function statusLabel(status: CrossChainStatus): string {
  switch (status) {
    case "executed":
      return "Executed";
    case "pending":
      return "Pending";
    case "not-transmitted":
      return "Not transmitted";
    case "expired":
      return "Expired";
  }
}

function statusBadgeColor(status: CrossChainStatus): string {
  switch (status) {
    case "executed":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "pending":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "not-transmitted":
      return "text-slate-600 bg-slate-50 border-slate-200";
    case "expired":
      return "text-red-700 bg-red-50 border-red-200";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEta(eta: number): string {
  const date = new Date(eta * 1000);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// --- Action card ---
function ActionStatusCard({ result }: { result: CrossChainActionResult }) {
  const { action, status, l2ProposalId, eta, creationTxHash, executionTxHash, error } = result;

  const creationUrl = creationTxHash ? getTxUrl(action.chainId, creationTxHash) : undefined;
  const executionUrl = executionTxHash ? getTxUrl(action.chainId, executionTxHash) : undefined;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-slate-600">#{action.actionIndex + 1}</span>
          </div>
          <div>
            <div className="font-semibold text-slate-900">{capitalize(action.chainName)}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              via {action.bridgeType} bridge
            </div>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadgeColor(status)}`}
        >
          {statusIcon(status)}
          {statusLabel(status)}
        </div>
      </div>

      {/* Details grid */}
      <div className="space-y-2 text-sm">
        {l2ProposalId !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">L2 Proposal ID</span>
            <span className="font-mono text-slate-800">#{l2ProposalId}</span>
          </div>
        )}

        {eta !== undefined && status === "pending" && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">ETA</span>
            <span className="text-slate-800">{formatEta(eta)}</span>
          </div>
        )}

        {creationTxHash && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">Bridge tx</span>
            {creationUrl ? (
              <a
                href={creationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                {creationTxHash.slice(0, 10)}…{creationTxHash.slice(-6)}
                <ArrowUpRight className="w-3 h-3" />
              </a>
            ) : (
              <span className="font-mono text-xs text-slate-700">{creationTxHash.slice(0, 10)}…</span>
            )}
          </div>
        )}

        {executionTxHash && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-28 shrink-0">Execution tx</span>
            {executionUrl ? (
              <a
                href={executionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                {executionTxHash.slice(0, 10)}…{executionTxHash.slice(-6)}
                <ArrowUpRight className="w-3 h-3" />
              </a>
            ) : (
              <span className="font-mono text-xs text-slate-700">{executionTxHash.slice(0, 10)}…</span>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 mt-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span className="text-xs text-red-600">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Single proposal results view ---
function ResultsView({ result, onReset }: { result: TrackingResult; onReset: () => void }) {
  const [showScrollTop, setShowScrollTop] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onReset();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onReset]);

  const executedCount = result.actions.filter((a) => a.status === "executed").length;
  const pendingCount = result.actions.filter((a) => a.status === "pending").length;
  const notTransmittedCount = result.actions.filter((a) => a.status === "not-transmitted").length;
  const expiredCount = result.actions.filter((a) => a.status === "expired").length;

  if (result.notFound || result.error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-center gap-6 mb-10">
            <button
              onClick={onReset}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
              title="Press Esc"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
            <div className="h-5 w-px bg-slate-300" />
            <h1 className="text-2xl font-semibold text-slate-900">Proposal #{result.proposalId}</h1>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-8 text-center">
            <div className="text-amber-600 font-semibold text-lg mb-2">
              {result.notFound ? "Proposal not found" : "Error"}
            </div>
            <div className="text-slate-500 text-sm">
              {result.notFound
                ? `Proposal #${result.proposalId} does not exist on-chain.`
                : result.error}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
        {/* Back button and title */}
        <div className="flex items-center gap-6 mb-10">
          <button
            onClick={onReset}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
            title="Press Esc"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>
          <div className="h-5 w-px bg-slate-300" />
          <h1 className="text-2xl font-semibold text-slate-900">Proposal #{result.proposalId}</h1>
          <div className="flex-1" />
          <div className="text-xs text-slate-400">{result.durationMs}ms</div>
        </div>

        {/* Status overview cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Governor state</div>
            <div
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${governorStateColor(result.governorState)}`}
            >
              {governorStateLabel(result.governorState)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Cross-chain actions</div>
            <div className="text-2xl font-bold text-slate-900">{result.actions.length}</div>
          </div>
          {result.hasCrossChainActions && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Executed</div>
                <div className="text-2xl font-bold text-emerald-600">{executedCount}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs text-slate-500 mb-1">Pending / Other</div>
                <div className="text-2xl font-bold text-amber-600">
                  {pendingCount + notTransmittedCount + expiredCount}
                </div>
              </div>
            </>
          )}
        </div>

        {/* L1 execution tx */}
        {result.l1ExecutionTxHash && (
          <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 mb-8 flex items-center gap-3 text-sm">
            <span className="text-slate-500 shrink-0">L1 execution tx</span>
            <a
              href={`https://etherscan.io/tx/${result.l1ExecutionTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              {result.l1ExecutionTxHash.slice(0, 10)}…{result.l1ExecutionTxHash.slice(-6)}
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Cross-chain actions */}
        {result.hasCrossChainActions ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              Cross-chain actions
            </h2>
            {result.actions.map((actionResult, idx) => (
              <ActionStatusCard key={idx} result={actionResult} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <Layers className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No cross-chain actions in this proposal</p>
          </div>
        )}
      </main>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 w-10 h-10 bg-slate-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-800 transition-colors"
          title="Scroll to top"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// --- Batch results view ---
function BatchResultsView({ result, onReset }: { result: BatchTrackingResult; onReset: () => void }) {
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const [showScrollTop, setShowScrollTop] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onReset();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onReset]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalidResults = result.results.filter((r) => r.notFound || r.error);
  const crossChainResults = result.results.filter((r) => r.hasCrossChainActions);
  const noCrossChainResults = result.results.filter((r) => !r.hasCrossChainActions && !r.notFound && !r.error);

  const allIds = result.results.map((r) => r.proposalId);
  const minId = Math.min(...allIds);
  const maxId = Math.max(...allIds);
  const rangeLabel = minId === maxId ? `#${minId}` : `#${minId} – #${maxId}`;

  const totalExecuted = result.results.filter((r) => r.governorState === GovernorState.Executed).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-6 lg:px-12 py-12">
        {/* Header */}
        <div className="flex items-center gap-6 mb-10">
          <button
            onClick={onReset}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
            title="Press Esc"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>
          <div className="h-5 w-px bg-slate-300" />
          <h1 className="text-2xl font-semibold text-slate-900">Proposals {rangeLabel}</h1>
          <div className="flex-1" />
          <div className="text-xs text-slate-400">{result.totalDurationMs}ms</div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Total proposals</div>
            <div className="text-2xl font-bold text-slate-900">{result.results.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Executed</div>
            <div className="text-2xl font-bold text-emerald-600">{totalExecuted}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Cross-chain</div>
            <div className="text-2xl font-bold text-blue-600">{crossChainResults.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">No cross-chain</div>
            <div className="text-2xl font-bold text-slate-500">{noCrossChainResults.length}</div>
          </div>
        </div>

        {/* Cross-chain proposals */}
        {crossChainResults.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
              Cross-chain proposals ({crossChainResults.length})
            </h2>
            <div className="space-y-2">
              {crossChainResults.map((r) => {
                const isExpanded = expanded.has(r.proposalId);
                return (
                  <div key={r.proposalId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                      onClick={() => toggleExpand(r.proposalId)}
                    >
                      <span className="font-semibold text-slate-900 w-16 shrink-0">#{r.proposalId}</span>
                      <div
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${governorStateColor(r.governorState)}`}
                      >
                        {governorStateLabel(r.governorState)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.actions.map((a, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeColor(a.status)}`}
                          >
                            {statusIcon(a.status)}
                            {capitalize(a.action.chainName)}
                          </span>
                        ))}
                      </div>
                      <div className="flex-1" />
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
                        {r.l1ExecutionTxHash && (
                          <div className="flex items-center gap-3 text-sm px-1">
                            <span className="text-slate-500 shrink-0">L1 execution tx</span>
                            <a
                              href={`https://etherscan.io/tx/${r.l1ExecutionTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {r.l1ExecutionTxHash.slice(0, 10)}…{r.l1ExecutionTxHash.slice(-6)}
                              <ArrowUpRight className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                        {r.actions.map((actionResult, idx) => (
                          <ActionStatusCard key={idx} result={actionResult} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Not found / error proposals */}
        {invalidResults.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
              Not found ({invalidResults.length})
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-2">
                {invalidResults.map((r) => (
                  <div
                    key={r.proposalId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-lg border border-amber-100"
                    title={r.error ?? "Proposal does not exist on-chain"}
                  >
                    <span className="text-sm font-medium text-slate-700">#{r.proposalId}</span>
                    <span className="text-xs text-amber-600">{r.notFound ? "not found" : "error"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No cross-chain proposals */}
        {noCrossChainResults.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
              No cross-chain actions ({noCrossChainResults.length})
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap gap-2">
                {noCrossChainResults.map((r) => (
                  <div
                    key={r.proposalId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100"
                  >
                    <span className="text-sm font-medium text-slate-700">#{r.proposalId}</span>
                    <div
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium border ${governorStateColor(r.governorState)}`}
                    >
                      {governorStateLabel(r.governorState)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 w-10 h-10 bg-slate-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-800 transition-colors"
          title="Scroll to top"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// --- Input view ---
function InputView({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (ids: number[]) => void;
  loading: boolean;
  error: string | null;
}) {
  const [input, setInput] = React.useState("");
  const [parseError, setParseError] = React.useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setParseError(null);
    if (!input.trim()) return;
    try {
      const ids = parseInput(input.trim());
      onSubmit(ids);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid input");
    }
  };

  const tryExample = (id: number) => {
    setInput(String(id));
    setParseError(null);
    onSubmit([id]);
  };

  const displayError = parseError ?? error;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <main className="w-full max-w-2xl mx-auto px-6">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-slate-900 mb-3">Proposal Tracker</h1>
          <p className="text-slate-500">
            Track cross-chain execution status for Compound governance proposals
          </p>
        </div>

        {/* Input card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="proposal-id" className="block text-sm font-medium text-slate-700 mb-2">
                Proposal ID or range
              </label>
              <input
                id="proposal-id"
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setParseError(null);
                }}
                placeholder="e.g. 292 or 446-526"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent text-lg"
                data-testid="proposal-id-input"
                disabled={loading}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Enter a single ID or a range (e.g., 446-526, max 200 proposals)
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              data-testid="track-submit-button"
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Tracking…
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Track
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error */}
        {displayError && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5">
            <h3 className="font-semibold text-red-800 mb-1">
              {parseError ? "Invalid Input" : "Tracking Failed"}
            </h3>
            <p className="text-red-600">{displayError}</p>
          </div>
        )}

        {/* Examples */}
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-400 mb-2">Try a cross-chain proposal:</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {[292, 293, 296].map((id) => (
              <button
                key={id}
                onClick={() => tryExample(id)}
                disabled={loading}
                className="px-3 py-1 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                #{id}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Page ---
type PageResult =
  | { kind: "single"; data: TrackingResult }
  | { kind: "batch"; data: BatchTrackingResult };

export default function TrackPage() {
  const [result, setResult] = React.useState<PageResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (ids: number[]) => {
    setLoading(true);
    setError(null);
    try {
      if (ids.length === 1) {
        const response = await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "single", proposalId: ids[0] }),
        });
        const data = await response.json();
        if (!data.success) {
          setError(data.error);
          return;
        }
        setResult({ kind: "single", data: data.data });
      } else {
        const response = await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "batch", proposalIds: ids }),
        });
        const data = await response.json();
        if (!data.success) {
          setError(data.error);
          return;
        }
        setResult({ kind: "batch", data: data.data });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to track proposal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  if (result?.kind === "single") {
    return <ResultsView result={result.data} onReset={handleReset} />;
  }

  if (result?.kind === "batch") {
    return <BatchResultsView result={result.data} onReset={handleReset} />;
  }

  return <InputView onSubmit={handleSubmit} loading={loading} error={error} />;
}
