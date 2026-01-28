"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RevertRequest, RevertResponse, RevertResultItem } from "@/types/simulator";

interface RevertButtonProps {
  chain?: string;
  chains?: string[];
  snapshot?: string;
  onRevertComplete?: (results: RevertResultItem[]) => void;
  onRevertError?: (error: string) => void;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  "data-testid"?: string;
}

export function RevertButton({
  chain,
  chains,
  snapshot,
  onRevertComplete,
  onRevertError,
  variant = "outline",
  size = "sm",
  className,
  "data-testid": testId,
}: RevertButtonProps) {
  const [isReverting, setIsReverting] = useState(false);

  const handleRevert = async () => {
    setIsReverting(true);

    try {
      let request: RevertRequest;

      if (chain) {
        request = { type: "single", chain, snapshot };
      } else if (chains && chains.length > 0) {
        request = { type: "multiple", chains, snapshot };
      } else {
        request = { type: "all", snapshot };
      }

      const response = await fetch("/api/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: RevertResponse = await response.json();

      if (data.success) {
        onRevertComplete?.(data.data);
      } else {
        onRevertError?.(data.error);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to revert";
      onRevertError?.(message);
    } finally {
      setIsReverting(false);
    }
  };

  const buttonLabel = chain
    ? isReverting
      ? "Reverting..."
      : "Revert"
    : isReverting
      ? "Reverting All..."
      : "Revert All";

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRevert}
      disabled={isReverting}
      className={className}
      data-testid={testId}
    >
      {buttonLabel}
    </Button>
  );
}
