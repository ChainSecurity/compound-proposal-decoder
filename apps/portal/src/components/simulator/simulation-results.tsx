"use client";

import { SimulationHeader } from "./simulation-header";
import { ChainResultCard } from "./chain-result-card";
import type { SerializedSimulationResult } from "@/types/simulator";

interface SimulationResultsProps {
  result: SerializedSimulationResult;
}

export function SimulationResults({ result }: SimulationResultsProps) {
  return (
    <div className="space-y-8" data-testid="simulation-results">
      {/* Header Stats */}
      <SimulationHeader result={result} />

      {/* Chain Results Section */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Chain Execution Results
        </h2>

        <div className="space-y-4">
          {result.chainResults.map((chainResult, index) => (
            <ChainResultCard key={`${chainResult.chain}-${index}`} result={chainResult} />
          ))}
        </div>
      </div>
    </div>
  );
}
