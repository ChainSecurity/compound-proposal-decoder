"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { SimulateRequest } from "@/types/simulator";

interface SimulatorFormProps {
  onSubmit: (request: SimulateRequest) => void;
  isLoading?: boolean;
}

export function SimulatorForm({ onSubmit, isLoading }: SimulatorFormProps) {
  const [activeTab, setActiveTab] = React.useState("id");
  const [proposalId, setProposalId] = React.useState("");
  const [calldata, setCalldata] = React.useState("");
  const [jsonInput, setJsonInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Hardcoded values - mode selector and backend selector are hidden
  const mode = "governance" as const;
  const backend = "tenderly" as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    switch (activeTab) {
      case "id": {
        const id = parseInt(proposalId, 10);
        if (isNaN(id) || id < 0) {
          setError("Please enter a valid proposal ID (non-negative integer)");
          return;
        }
        onSubmit({ type: "id", proposalId: id, mode, backend });
        break;
      }
      case "calldata": {
        const trimmed = calldata.trim();
        if (!trimmed) {
          setError("Please enter calldata");
          return;
        }
        if (!trimmed.startsWith("0x")) {
          setError("Calldata must be a hex string starting with 0x");
          return;
        }
        if (!/^0x[0-9a-fA-F]*$/.test(trimmed)) {
          setError("Calldata must contain only hexadecimal characters");
          return;
        }
        onSubmit({ type: "calldata", calldata: trimmed, mode, backend });
        break;
      }
      case "json": {
        try {
          const parsed = JSON.parse(jsonInput);
          if (!parsed.targets || !parsed.values || !parsed.calldatas) {
            setError("JSON must include targets, values, and calldatas arrays");
            return;
          }
          onSubmit({
            type: "details",
            details: {
              targets: parsed.targets,
              values: parsed.values.map(String),
              calldatas: parsed.calldatas,
              descriptionHash: parsed.descriptionHash || "0x",
            },
            mode,
            backend,
          });
        } catch {
          setError("Invalid JSON format");
        }
        break;
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="id"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Proposal ID
          </TabsTrigger>
          <TabsTrigger
            value="calldata"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Calldata
          </TabsTrigger>
          <TabsTrigger
            value="json"
            className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="id" className="space-y-4 mt-6">
          <div className="space-y-2">
            <label
              htmlFor="proposalId"
              className="text-sm font-medium text-slate-700"
            >
              Proposal ID
            </label>
            <Input
              id="proposalId"
              type="number"
              min="0"
              placeholder="Enter proposal ID (e.g., 527)"
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              disabled={isLoading}
              className="bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-200"
              data-testid="simulator-proposal-id-input"
            />
            <p className="text-xs text-slate-500">
              Enter the on-chain proposal ID from the Compound Governor
            </p>
          </div>
        </TabsContent>

        <TabsContent value="calldata" className="space-y-4 mt-6">
          <div className="space-y-2">
            <label
              htmlFor="calldata"
              className="text-sm font-medium text-slate-700"
            >
              Calldata
            </label>
            <Textarea
              id="calldata"
              placeholder="0x..."
              className="min-h-[120px] font-mono text-xs bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-200"
              value={calldata}
              onChange={(e) => setCalldata(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500">
              Enter the raw propose() calldata as a hex string
            </p>
          </div>
        </TabsContent>

        <TabsContent value="json" className="space-y-4 mt-6">
          <div className="space-y-2">
            <label
              htmlFor="json"
              className="text-sm font-medium text-slate-700"
            >
              Proposal Details (JSON)
            </label>
            <Textarea
              id="json"
              placeholder={`{
  "targets": ["0x..."],
  "values": ["0"],
  "calldatas": ["0x..."],
  "descriptionHash": "0x..."
}`}
              className="min-h-[180px] font-mono text-xs bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-200"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500">
              Enter proposal details as JSON with targets, values, and calldatas arrays
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-200" data-testid="simulator-error">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full h-12 text-base font-medium rounded-xl bg-slate-900 hover:bg-slate-800"
        disabled={isLoading}
        data-testid="simulate-submit-button"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Simulating...
          </span>
        ) : (
          "Simulate Proposal"
        )}
      </Button>
    </form>
  );
}
