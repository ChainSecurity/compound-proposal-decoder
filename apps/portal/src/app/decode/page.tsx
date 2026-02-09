"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DecoderInput } from "@/components/decoder/decoder-input";
import { ProposalOverview } from "@/components/decoder/proposal-overview";
import { ActionCard } from "@/components/decoder/action-card";
import { ActionMinimap, getAllActionIds } from "@/components/decoder/action-minimap";
import { LoadingSteps } from "@/components/decoder/loading-steps";
import { ArrowLeft, ChevronUp, ChevronsUpDown, Code2, CheckCircle2 } from "lucide-react";
import type { DecodeRequest, DecodeResponse, SerializedDecodedProposal } from "@/types/decoder";
import { unwrap } from "@/types/sources";

function ResultsView({ result, onReset }: { result: SerializedDecodedProposal; onReset: () => void }) {
  const [activeId, setActiveId] = React.useState<string | null>("action-0");
  const [allExpanded, setAllExpanded] = React.useState(true);
  const [showRawJson, setShowRawJson] = React.useState(false);
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [reviewedIds, setReviewedIds] = React.useState<Set<string>>(new Set());
  const allIds = React.useMemo(() => getAllActionIds(result.calls), [result.calls]);

  // Build parent-child tree relationships from hierarchical IDs
  const { childrenOf, parentOf, descendantsOf } = React.useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string>();

    for (const id of allIds) {
      const lastDash = id.lastIndexOf("-");
      // "action-0" has lastDash=6 → slice(0,6)="action" → top-level, no parent
      // "action-0-1" has lastDash=8 → slice(0,8)="action-0" → valid parent
      const parentId = lastDash > 6 ? id.slice(0, lastDash) : null;
      if (parentId) {
        parentOf.set(id, parentId);
        if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
        childrenOf.get(parentId)!.push(id);
      }
    }

    function getDescendants(id: string): string[] {
      const children = childrenOf.get(id) ?? [];
      return children.flatMap((c) => [c, ...getDescendants(c)]);
    }

    const descendantsOf = new Map<string, string[]>();
    for (const id of allIds) {
      descendantsOf.set(id, getDescendants(id));
    }

    return { childrenOf, parentOf, descendantsOf };
  }, [allIds]);

  const toggleReviewed = React.useCallback((id: string) => {
    setReviewedIds((prev) => {
      const next = new Set(prev);
      const wasReviewed = next.has(id);

      if (wasReviewed) {
        // Uncheck: remove self + all descendants
        next.delete(id);
        for (const desc of descendantsOf.get(id) ?? []) {
          next.delete(desc);
        }
        // Uncheck all ancestors (no longer fully reviewed)
        let current = parentOf.get(id);
        while (current) {
          next.delete(current);
          current = parentOf.get(current);
        }
      } else {
        // Check: add self + all descendants
        next.add(id);
        for (const desc of descendantsOf.get(id) ?? []) {
          next.add(desc);
        }
        // Auto-check ancestors if all their children are now reviewed
        let current = parentOf.get(id);
        while (current) {
          const siblings = childrenOf.get(current) ?? [];
          if (siblings.every((s) => next.has(s))) {
            next.add(current);
          } else {
            break;
          }
          current = parentOf.get(current);
        }
      }

      return next;
    });
  }, [childrenOf, parentOf, descendantsOf]);

  const proposalId = unwrap(result.proposalId);
  const proposalTitle = proposalId !== "0"
    ? `Proposal #${proposalId}`
    : "Decoded Proposal";

  // Track scroll position for "jump to top" button
  React.useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to go back
      if (e.key === "Escape") {
        onReset();
        return;
      }

      // Arrow keys to navigate through all calls (including nested)
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const currentIndex = allIds.findIndex(id => id === activeId);
        let nextIndex = currentIndex === -1 ? 0 : currentIndex;

        if (e.key === "ArrowUp" && currentIndex > 0) {
          nextIndex = currentIndex - 1;
        } else if (e.key === "ArrowDown" && currentIndex < allIds.length - 1) {
          nextIndex = currentIndex + 1;
        }

        if (nextIndex !== currentIndex || currentIndex === -1) {
          scrollToAction(allIds[nextIndex]);
          setActiveId(allIds[nextIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeId, allIds, onReset]);

  // Track which action is currently in view
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target.id) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [allIds]);

  const scrollToAction = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const rect = el.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = rect.top + scrollTop - 32;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleAllExpanded = () => {
    setAllExpanded(!allExpanded);
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="min-h-screen bg-slate-50">
        <main className="max-w-[1800px] mx-auto px-8 lg:px-16 py-12">
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
            <h1 className="text-2xl font-semibold text-slate-900">{proposalTitle}</h1>
            <span className="text-sm text-slate-400">
              {result.calls.length} {result.calls.length === 1 ? "action" : "actions"}
            </span>
            {reviewedIds.size > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                {reviewedIds.size} / {allIds.length} reviewed
              </span>
            )}
            <div className="flex-1" />
            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  showRawJson
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
                title="Toggle raw JSON view"
              >
                <Code2 className="w-4 h-4" />
                <span className="hidden sm:inline">JSON</span>
              </button>
              <button
                onClick={toggleAllExpanded}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-200 transition-colors"
                title={allExpanded ? "Collapse all" : "Expand all"}
              >
                <ChevronsUpDown className="w-4 h-4" />
                <span className="hidden sm:inline">{allExpanded ? "Collapse" : "Expand"}</span>
              </button>
            </div>
          </div>

          {showRawJson ? (
            /* Raw JSON View */
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <pre className="text-sm font-mono text-slate-700 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-10">
              {/* Left sidebar with stats */}
              <div className="lg:w-64 shrink-0">
                <div className="lg:sticky lg:top-8">
                  <ProposalOverview
                    proposal={result}
                    reviewedCount={reviewedIds.size}
                    totalCount={allIds.length}
                  />
                </div>
              </div>

              {/* Main content - Actions */}
              <div className="flex-1 min-w-0">
                <div className="space-y-5">
                  {result.calls.map((call, idx) => (
                    <ActionCard
                      key={idx}
                      node={call}
                      index={idx + 1}
                      total={result.calls.length}
                      id={`action-${idx}`}
                      defaultExpanded={allExpanded}
                      reviewedIds={reviewedIds}
                      onToggleReviewed={toggleReviewed}
                    />
                  ))}
                </div>
              </div>

              {/* Right sidebar - Minimap */}
              <div className="hidden lg:block w-56 shrink-0">
                <div className="sticky top-8">
                  <ActionMinimap
                    calls={result.calls}
                    activeId={activeId}
                    onSelect={scrollToAction}
                    reviewedIds={reviewedIds}
                  />
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Jump to top button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 w-10 h-10 bg-slate-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-800 transition-colors"
            title="Scroll to top"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}

export default function DecodePage() {
  const [result, setResult] = React.useState<SerializedDecodedProposal | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadingStep, setLoadingStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [lastInput, setLastInput] = React.useState<string>("");

  const handleSubmit = async (request: DecodeRequest, inputLabel: string) => {
    setLoading(true);
    setError(null);
    setLastInput(inputLabel);
    setLoadingStep(0);

    try {
      // Simulate loading steps
      setLoadingStep(1); // Fetching proposal
      const response = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...request,
          options: { trackSources: true },
        }),
      });

      setLoadingStep(2); // Decoding actions
      const data = (await response.json()) as DecodeResponse;

      if (!data.success) {
        setError(data.error);
        return;
      }

      setLoadingStep(3); // Done
      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decode proposal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setLastInput("");
  };

  // Loading state
  if (loading) {
    return (
      <TooltipProvider delayDuration={100}>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <LoadingSteps currentStep={loadingStep} inputLabel={lastInput} />
        </div>
      </TooltipProvider>
    );
  }

  // Results view
  if (result) {
    return <ResultsView result={result} onReset={handleReset} />;
  }

  // Input view (default)
  return (
    <TooltipProvider delayDuration={100}>
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <main className="w-full max-w-2xl mx-auto px-6">
          {/* Hero */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-semibold text-slate-900 mb-3">
              Proposal Decoder
            </h1>
            <p className="text-slate-500">
              Decode and analyze Compound governance proposals
            </p>
          </div>

          {/* Input Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <DecoderInput onSubmit={handleSubmit} />
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5">
              <h3 className="font-semibold text-red-800 mb-1">Decoding Failed</h3>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Example proposals hint */}
          <div className="mt-8 text-center">
            <p className="text-sm text-slate-400 mb-2">Try these examples:</p>
            <div className="flex justify-center gap-2 flex-wrap">
              {[439, 440, 441].map((id) => (
                <button
                  key={id}
                  onClick={() => handleSubmit({ type: "id", proposalId: id }, `Proposal #${id}`)}
                  className="px-3 py-1 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  #{id}
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
