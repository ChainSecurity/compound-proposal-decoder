"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ConfigWarning, WarningSeverity } from "@/types/config";
import { groupWarningsBySeverity } from "@/lib/config-validation";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ConfigWarningsProps {
  warnings: ConfigWarning[];
  bootstrapped: boolean;
}

const severityConfig: Record<
  WarningSeverity,
  { bg: string; border: string; icon: string; title: string }
> = {
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "text-red-500",
    title: "Errors",
  },
  warning: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    icon: "text-yellow-500",
    title: "Warnings",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-500",
    title: "Info",
  },
};

function WarningIcon({ severity }: { severity: WarningSeverity }) {
  const color = severityConfig[severity].icon;
  if (severity === "error") {
    return (
      <svg
        className={cn("w-4 h-4", color)}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg
        className={cn("w-4 h-4", color)}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    );
  }
  return (
    <svg
      className={cn("w-4 h-4", color)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function WarningGroup({
  severity,
  warnings,
}: {
  severity: WarningSeverity;
  warnings: ConfigWarning[];
}) {
  const config = severityConfig[severity];
  const [isOpen, setIsOpen] = React.useState(severity === "error");

  if (warnings.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("rounded-lg border", config.bg, config.border)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left">
          <div className="flex items-center gap-2">
            <WarningIcon severity={severity} />
            <span className="font-medium text-sm">
              {config.title} ({warnings.length})
            </span>
          </div>
          <svg
            className={cn(
              "w-4 h-4 transition-transform",
              isOpen && "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-1">
            {warnings.map((warning, idx) => (
              <div
                key={`${warning.field}-${idx}`}
                className="text-sm text-gray-700 flex items-start gap-2"
              >
                <span className="text-gray-400">-</span>
                <span>
                  {warning.chain && (
                    <span className="font-medium">[{warning.chain}] </span>
                  )}
                  <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                    {warning.field}
                  </span>
                  : {warning.message}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ConfigWarnings({ warnings, bootstrapped }: ConfigWarningsProps) {
  const grouped = groupWarningsBySeverity(warnings);

  if (!bootstrapped && warnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {bootstrapped && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-green-500 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 className="font-medium text-green-800">First-Time Setup</h3>
              <p className="text-sm text-green-700 mt-1">
                Configuration file created from example template. Please update
                the placeholder values with your actual API keys and RPC URLs.
              </p>
            </div>
          </div>
        </div>
      )}

      <WarningGroup severity="error" warnings={grouped.error} />
      <WarningGroup severity="warning" warnings={grouped.warning} />
      <WarningGroup severity="info" warnings={grouped.info} />
    </div>
  );
}
