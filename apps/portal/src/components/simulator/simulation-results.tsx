"use client";

import { useState } from "react";
import { SimulationHeader } from "./simulation-header";
import { ChainResultCard } from "./chain-result-card";
import { RevertButton } from "./revert-button";
import type { SerializedSimulationResult, RevertResultItem } from "@/types/simulator";

interface SimulationResultsProps {
  result: SerializedSimulationResult;
}

export function SimulationResults({ result }: SimulationResultsProps) {
  const [revertAllMessage, setRevertAllMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const persistedChains = result.chainResults.filter((r) => r.persisted);
  const showRevertAll = persistedChains.length > 1;

  const handleRevertAllComplete = (results: RevertResultItem[]) => {
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    if (failCount === 0) {
      setRevertAllMessage({
        type: "success",
        text: `Successfully reverted ${successCount} chain${successCount > 1 ? "s" : ""}`,
      });
    } else {
      setRevertAllMessage({
        type: "error",
        text: `Reverted ${successCount}/${results.length} chains. ${failCount} failed.`,
      });
    }

    setTimeout(() => setRevertAllMessage(null), 5000);
  };

  const handleRevertAllError = (error: string) => {
    setRevertAllMessage({ type: "error", text: error });
    setTimeout(() => setRevertAllMessage(null), 5000);
  };

  return (
    <div className="space-y-8" data-testid="simulation-results">
      {/* Header Stats */}
      <SimulationHeader result={result} />

      {/* Chain Results Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Chain Execution Results
          </h2>
          {showRevertAll && (
            <RevertButton
              chains={persistedChains.map((r) => r.chain)}
              onRevertComplete={handleRevertAllComplete}
              onRevertError={handleRevertAllError}
            />
          )}
        </div>

        {revertAllMessage && (
          <div
            className={`text-sm px-4 py-3 rounded-xl ${
              revertAllMessage.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {revertAllMessage.text}
          </div>
        )}

        <div className="space-y-4">
          {result.chainResults.map((chainResult, index) => (
            <ChainResultCard key={`${chainResult.chain}-${index}`} result={chainResult} />
          ))}
        </div>
      </div>
    </div>
  );
}
