"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SimulatorForm, SimulationResults, SimulationProgress } from "@/components/simulator";
import { ArrowLeft, ChevronUp } from "lucide-react";
import type { SimulateRequest, SimulateResponse, SerializedSimulationResult } from "@/types/simulator";

function ResultsView({ result, onReset }: { result: SerializedSimulationResult; onReset: () => void }) {
  const [showScrollTop, setShowScrollTop] = React.useState(false);

  const proposalTitle = result.proposalId
    ? `Proposal #${result.proposalId}`
    : "Simulation Result";

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onReset]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-5xl mx-auto px-6 lg:px-8 py-12">
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
            {result.chainResults.length} {result.chainResults.length === 1 ? "chain" : "chains"}
          </span>
        </div>

        <SimulationResults result={result} />
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
  );
}

function LoadingView({ startTime }: { startTime: number }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto px-6">
        <SimulationProgress startTime={startTime} />
      </div>
    </div>
  );
}

export default function SimulatePage() {
  const [result, setResult] = React.useState<SerializedSimulationResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [startTime, setStartTime] = React.useState<number | null>(null);

  const handleSubmit = async (request: SimulateRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setStartTime(Date.now());

    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      const data = (await response.json()) as SimulateResponse;

      if (!data.success) {
        setError(data.error);
        return;
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to simulate proposal");
    } finally {
      setLoading(false);
      setStartTime(null);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  // Loading state
  if (loading && startTime) {
    return (
      <TooltipProvider>
        <LoadingView startTime={startTime} />
      </TooltipProvider>
    );
  }

  // Results view
  if (result) {
    return (
      <TooltipProvider>
        <ResultsView result={result} onReset={handleReset} />
      </TooltipProvider>
    );
  }

  // Input view (default)
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12">
        <main className="w-full max-w-2xl mx-auto px-6">
          {/* Hero */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-semibold text-slate-900 mb-3">
              Proposal Simulator
            </h1>
            <p className="text-slate-500">
              Simulate Compound governance proposals on Tenderly virtual testnets
            </p>
          </div>

          {/* Input Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <SimulatorForm
              onSubmit={handleSubmit}
              isLoading={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5">
              <h3 className="font-semibold text-red-800 mb-1">Simulation Failed</h3>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Example proposals hint */}
          <div className="mt-8 text-center">
            <p className="text-sm text-slate-400 mb-2">Try these examples:</p>
            <div className="flex justify-center gap-2 flex-wrap">
              {[528, 524, 519].map((id) => (
                <button
                  key={id}
                  onClick={() => handleSubmit({ type: "id", proposalId: id, mode: "governance", backend: "tenderly" })}
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
