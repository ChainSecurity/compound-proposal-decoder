"use client";

import * as React from "react";
import { SecretInput } from "./secret-input";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { hasFieldPlaceholder } from "@/lib/config-validation";
import { cn } from "@/lib/utils";
import type { DefaultsConfig } from "@/types/config";

interface GlobalSettingsProps {
  etherscanApiKey: string;
  defaults: DefaultsConfig;
  onEtherscanApiKeyChange: (value: string) => void;
  onDefaultsChange: (defaults: DefaultsConfig) => void;
}

function InfoIcon() {
  return (
    <svg
      className="w-4 h-4 text-gray-400"
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

function FieldLabel({
  label,
  tooltip,
  hasWarning,
}: {
  label: string;
  tooltip: string;
  hasWarning?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label
        className={cn(
          "text-sm font-medium",
          hasWarning && "text-red-600"
        )}
      >
        {label}
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help">
            <InfoIcon />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
      {hasWarning && (
        <span className="text-xs text-red-500">(placeholder)</span>
      )}
    </div>
  );
}

export function GlobalSettings({
  etherscanApiKey,
  defaults,
  onEtherscanApiKeyChange,
  onDefaultsChange,
}: GlobalSettingsProps) {
  const handleDefaultChange = (key: keyof DefaultsConfig, value: string) => {
    onDefaultsChange({ ...defaults, [key]: value });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">API Keys</h3>
        <div className="space-y-2">
          <FieldLabel
            label="Etherscan API Key"
            tooltip="Etherscan V2 API key used to fetch verified contract ABIs. Required for decoder functionality."
            hasWarning={hasFieldPlaceholder(etherscanApiKey)}
          />
          <SecretInput
            value={etherscanApiKey}
            onChange={(e) => onEtherscanApiKeyChange(e.target.value)}
            placeholder="Enter your Etherscan API key"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Default Values</h3>
        <p className="text-sm text-gray-500">
          These values are used as defaults for simulation and testing.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel
              label="Gas Limit"
              tooltip="Default gas limit for simulation transactions. Used when gas is not specified."
            />
            <Input
              value={defaults.gas}
              onChange={(e) => handleDefaultChange("gas", e.target.value)}
              placeholder="0xfffffffff"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel
              label="Gas Price"
              tooltip="Default gas price for simulation transactions. Usually set to 0 for simulations."
            />
            <Input
              value={defaults.gasPrice}
              onChange={(e) => handleDefaultChange("gasPrice", e.target.value)}
              placeholder="0x0"
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel
              label="Robinhood Address"
              tooltip="Address used to fund simulation accounts with tokens for testing."
            />
            <Input
              value={defaults.robinhood}
              onChange={(e) => handleDefaultChange("robinhood", e.target.value)}
              placeholder="0x..."
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel
              label="COMP Token Address"
              tooltip="Address of the COMP governance token on mainnet."
            />
            <Input
              value={defaults.COMP}
              onChange={(e) => handleDefaultChange("COMP", e.target.value)}
              placeholder="0x..."
              className="font-mono text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
