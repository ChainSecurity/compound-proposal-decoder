"use client";

import * as React from "react";
import { Clock, Vote, Zap, Globe, CheckCircle } from "lucide-react";

interface SimulationProgressProps {
  startTime: number;
}

const steps = [
  { label: "Creating state snapshots", icon: Globe },
  { label: "Setting up delegation", icon: Vote },
  { label: "Executing transactions", icon: Zap },
  { label: "Processing bridges", icon: Globe },
];

export function SimulationProgress({ startTime }: SimulationProgressProps) {
  const [elapsed, setElapsed] = React.useState(0);
  const [currentStep, setCurrentStep] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(newElapsed);

      // Progress through steps based on time
      if (newElapsed >= 60) setCurrentStep(3);
      else if (newElapsed >= 30) setCurrentStep(2);
      else if (newElapsed >= 10) setCurrentStep(1);
      else setCurrentStep(0);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeString = minutes > 0
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-50 mb-4">
          <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-1">
          Simulating Proposal
        </h2>
        <p className="text-slate-500">
          Running on Tenderly virtual testnets
        </p>
      </div>

      {/* Timer */}
      <div className="flex items-center justify-center gap-3 mb-8 py-4 bg-slate-50 rounded-xl">
        <Clock className="w-5 h-5 text-slate-400" />
        <span className="text-2xl font-mono font-bold text-slate-900">{timeString}</span>
      </div>

      {/* Progress Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isComplete = index < currentStep;

          return (
            <div
              key={step.label}
              className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${
                isActive
                  ? "bg-purple-50 border border-purple-200"
                  : isComplete
                  ? "bg-emerald-50 border border-emerald-200"
                  : "bg-slate-50 border border-slate-100"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isActive
                  ? "bg-purple-100"
                  : isComplete
                  ? "bg-emerald-100"
                  : "bg-slate-100"
              }`}>
                {isComplete ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Icon className={`w-5 h-5 ${
                    isActive ? "text-purple-600" : "text-slate-400"
                  }`} />
                )}
              </div>
              <span className={`font-medium ${
                isActive
                  ? "text-purple-900"
                  : isComplete
                  ? "text-emerald-900"
                  : "text-slate-500"
              }`}>
                {step.label}
              </span>
              {isActive && (
                <div className="ml-auto">
                  <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-6 text-center text-sm text-slate-500">
        Simulations typically complete in 1-3 minutes
      </p>
    </div>
  );
}
