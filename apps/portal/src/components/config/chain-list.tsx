"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChainConfigCard } from "./chain-config-card";
import type { ChainConfig } from "@/types/config";

interface ChainListProps {
  chains: Record<string, ChainConfig>;
  onChainsChange: (chains: Record<string, ChainConfig>) => void;
}

export function ChainList({ chains, onChainsChange }: ChainListProps) {
  const [isAdding, setIsAdding] = React.useState(false);
  const [newChainName, setNewChainName] = React.useState("");
  const [newChainError, setNewChainError] = React.useState("");

  const chainNames = Object.keys(chains);

  const handleChainChange = (chainName: string, config: ChainConfig) => {
    onChainsChange({
      ...chains,
      [chainName]: config,
    });
  };

  const handleChainDelete = (chainName: string) => {
    const { [chainName]: _, ...rest } = chains;
    onChainsChange(rest);
  };

  const handleAddChain = () => {
    const name = newChainName.trim().toLowerCase();

    if (!name) {
      setNewChainError("Chain name is required");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      setNewChainError("Chain name must contain only lowercase letters, numbers, and hyphens");
      return;
    }

    if (chains[name]) {
      setNewChainError("A chain with this name already exists");
      return;
    }

    onChainsChange({
      ...chains,
      [name]: {
        chainId: 0,
        rpcUrl: "",
        directory: name,
      },
    });

    setNewChainName("");
    setNewChainError("");
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewChainName("");
    setNewChainError("");
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Chains</h3>
          <p className="text-sm text-gray-500">
            Configure RPC endpoints and contract addresses for each chain.
          </p>
        </div>
        {!isAdding && (
          <Button variant="outline" onClick={() => setIsAdding(true)}>
            Add Chain
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Chain Name</label>
            <Input
              value={newChainName}
              onChange={(e) => {
                setNewChainName(e.target.value);
                setNewChainError("");
              }}
              placeholder="e.g., arbitrum, optimism, base"
              className="max-w-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddChain();
                if (e.key === "Escape") handleCancelAdd();
              }}
            />
            {newChainError && (
              <p className="text-sm text-red-500">{newChainError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddChain}>
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancelAdd}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {chainNames.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">
            No chains configured. Click &quot;Add Chain&quot; to get started.
          </p>
        ) : (
          chainNames.map((chainName) => (
            <ChainConfigCard
              key={chainName}
              chainName={chainName}
              config={chains[chainName]}
              onChange={(config) => handleChainChange(chainName, config)}
              onDelete={() => handleChainDelete(chainName)}
            />
          ))
        )}
      </div>
    </div>
  );
}
