"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SecretInput } from "./secret-input";
import { getChainStatus, hasFieldPlaceholder } from "@/lib/config-validation";
import { cn } from "@/lib/utils";
import type { ChainConfig } from "@/types/config";

interface ChainConfigCardProps {
  chainName: string;
  config: ChainConfig;
  onChange: (config: ChainConfig) => void;
  onDelete: () => void;
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
  optional,
}: {
  label: string;
  tooltip: string;
  hasWarning?: boolean;
  optional?: boolean;
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
        {optional && <span className="text-gray-400 font-normal"> (optional)</span>}
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

function StatusBadge({ status }: { status: "configured" | "partial" | "not-configured" }) {
  if (status === "configured") {
    return <Badge variant="green">Configured</Badge>;
  }
  if (status === "partial") {
    return <Badge variant="yellow">Partial</Badge>;
  }
  return <Badge variant="gray">Not Configured</Badge>;
}

export function ChainConfigCard({
  chainName,
  config,
  onChange,
  onDelete,
}: ChainConfigCardProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const status = getChainStatus(config);

  const handleChange = <K extends keyof ChainConfig>(
    key: K,
    value: ChainConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">{chainName}</CardTitle>
              <StatusBadge status={status} />
              {config.chainId && (
                <span className="text-xs text-gray-400 font-mono">
                  Chain ID: {config.chainId}
                </span>
              )}
            </div>
            <svg
              className={cn(
                "w-5 h-5 text-gray-400 transition-transform",
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
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel
                  label="Chain ID"
                  tooltip="Numeric identifier for the blockchain network."
                />
                <Input
                  type="number"
                  value={config.chainId}
                  onChange={(e) =>
                    handleChange("chainId", parseInt(e.target.value) || 0)
                  }
                  placeholder="1"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel
                  label="Directory"
                  tooltip="Comet deployments directory name for this chain."
                />
                <Input
                  value={config.directory}
                  onChange={(e) => handleChange("directory", e.target.value)}
                  placeholder="mainnet"
                />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel
                label="RPC URL"
                tooltip="RPC endpoint for reading chain data. Used by the decoder."
                hasWarning={hasFieldPlaceholder(config.rpcUrl)}
              />
              <SecretInput
                value={config.rpcUrl}
                onChange={(e) => handleChange("rpcUrl", e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-2">
              <FieldLabel
                label="Simulator RPC URL"
                tooltip="Tenderly virtual testnet URL for running simulations."
                hasWarning={hasFieldPlaceholder(config.simulatorRpcUrl)}
                optional
              />
              <SecretInput
                value={config.simulatorRpcUrl || ""}
                onChange={(e) =>
                  handleChange("simulatorRpcUrl", e.target.value || undefined)
                }
                placeholder="https://virtual.mainnet.eu.rpc.tenderly.co/..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel
                  label="Governor Address"
                  tooltip="Address of the governance contract (mainnet only)."
                  optional
                />
                <Input
                  value={config.governorAddress || ""}
                  onChange={(e) =>
                    handleChange("governorAddress", e.target.value || undefined)
                  }
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel
                  label="Timelock Address"
                  tooltip="Address of the timelock contract for this chain."
                />
                <Input
                  value={config.timelockAddress || ""}
                  onChange={(e) =>
                    handleChange("timelockAddress", e.target.value || undefined)
                  }
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel
                  label="Bridge Address"
                  tooltip="L1 bridge contract address for cross-chain messages."
                  optional
                />
                <Input
                  value={config.bridge || ""}
                  onChange={(e) =>
                    handleChange("bridge", e.target.value || undefined)
                  }
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel
                  label="Receiver Address"
                  tooltip="L2 receiver contract for cross-chain messages."
                  optional
                />
                <Input
                  value={config.receiver || ""}
                  onChange={(e) =>
                    handleChange("receiver", e.target.value || undefined)
                  }
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel
                  label="L2 Message Sender"
                  tooltip="Expected msg.sender on L2 for cross-chain messages."
                  optional
                />
                <Input
                  value={config.l2msgsender || ""}
                  onChange={(e) =>
                    handleChange("l2msgsender", e.target.value || undefined)
                  }
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">
                    Delete &quot;{chainName}&quot;?
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDelete}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Delete Chain
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
