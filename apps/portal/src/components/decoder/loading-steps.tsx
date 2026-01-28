"use client";

import { Check, Loader2 } from "lucide-react";

interface LoadingStepsProps {
  currentStep: number;
  inputLabel: string;
}

const steps = [
  { label: "Fetching proposal data", description: "Getting on-chain data..." },
  { label: "Decoding actions", description: "Parsing calldata..." },
  { label: "Enriching metadata", description: "Resolving contract names..." },
];

export function LoadingSteps({ currentStep, inputLabel }: LoadingStepsProps) {
  return (
    <div className="text-center">
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          Decoding {inputLabel}
        </h2>
        <p className="text-slate-500">This may take a few seconds...</p>
      </div>

      <div className="inline-flex flex-col items-start gap-4 text-left">
        {steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isActive = currentStep === stepNum;
          const isComplete = currentStep > stepNum;

          return (
            <div key={idx} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isComplete
                    ? "bg-emerald-100 text-emerald-600"
                    : isActive
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isComplete ? (
                  <Check className="w-4 h-4" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-sm font-medium">{stepNum}</span>
                )}
              </div>
              <div>
                <div
                  className={`font-medium ${
                    isActive ? "text-slate-900" : isComplete ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </div>
                {isActive && (
                  <div className="text-sm text-slate-500">{step.description}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
