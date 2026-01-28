"use client";

import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigForm } from "@/components/config";
import type { AppConfig, ConfigWarning } from "@/types/config";

interface ConfigState {
  loading: boolean;
  error: string | null;
  config: AppConfig | null;
  warnings: ConfigWarning[];
  bootstrapped: boolean;
}

export default function ConfigPage() {
  const [state, setState] = React.useState<ConfigState>({
    loading: true,
    error: null,
    config: null,
    warnings: [],
    bootstrapped: false,
  });

  React.useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to load configuration");
        }

        setState({
          loading: false,
          error: null,
          config: data.config,
          warnings: data.warnings,
          bootstrapped: data.bootstrapped,
        });
      } catch (error) {
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load",
          config: null,
          warnings: [],
          bootstrapped: false,
        });
      }
    }

    loadConfig();
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <main className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Configuration</h1>
            <p className="text-gray-500 mt-1">
              Manage API keys, RPC endpoints, and chain settings
            </p>
          </div>

          {state.loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          )}

          {state.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-500 mt-0.5"
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
                <div>
                  <h3 className="font-medium text-red-800">
                    Failed to Load Configuration
                  </h3>
                  <p className="text-sm text-red-700 mt-1">{state.error}</p>
                  <p className="text-sm text-red-600 mt-2">
                    Make sure{" "}
                    <code className="bg-red-100 px-1 rounded">
                      compound-config.json.example
                    </code>{" "}
                    exists in the monorepo root.
                  </p>
                </div>
              </div>
            </div>
          )}

          {state.config && (
            <ConfigForm
              initialConfig={state.config}
              initialWarnings={state.warnings}
              bootstrapped={state.bootstrapped}
            />
          )}
        </div>
      </main>
    </TooltipProvider>
  );
}
