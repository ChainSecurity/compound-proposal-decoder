"use client";

import * as React from "react";
import { Search, Hash, FileCode, Braces, Loader2 } from "lucide-react";
import type { DecodeRequest } from "@/types/decoder";

interface DecoderInputProps {
  onSubmit: (request: DecodeRequest, inputLabel: string) => void;
}

type Mode = "id" | "calldata" | "json";

export function DecoderInput({ onSubmit }: DecoderInputProps) {
  const [mode, setMode] = React.useState<Mode>("id");
  const [proposalId, setProposalId] = React.useState("");
  const [calldata, setCalldata] = React.useState("");
  const [jsonInput, setJsonInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = () => {
    setError(null);

    if (mode === "id") {
      const id = parseInt(proposalId, 10);
      if (isNaN(id) || id < 0) {
        setError("Enter a valid proposal ID");
        return;
      }
      setSubmitting(true);
      onSubmit({ type: "id", proposalId: id }, `Proposal #${id}`);
    } else if (mode === "calldata") {
      const trimmed = calldata.trim();
      if (!trimmed || !trimmed.startsWith("0x")) {
        setError("Enter valid hex calldata starting with 0x");
        return;
      }
      setSubmitting(true);
      onSubmit({ type: "calldata", calldata: trimmed }, "calldata");
    } else {
      try {
        const parsed = JSON.parse(jsonInput);
        if (!parsed.targets || !parsed.values || !parsed.calldatas) {
          setError("JSON must include targets, values, and calldatas");
          return;
        }
        setSubmitting(true);
        onSubmit({
          type: "details",
          details: {
            targets: parsed.targets,
            values: parsed.values.map(String),
            calldatas: parsed.calldatas,
            descriptionHash: parsed.descriptionHash || "0x",
          },
          metadata: parsed.metadata,
        }, "custom proposal");
      } catch {
        setError("Invalid JSON");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (mode === "id" || (mode === "calldata" && !e.shiftKey) || (mode === "json" && e.metaKey)) {
        e.preventDefault();
        submit();
      }
    }
  };

  const modes = [
    { key: "id" as Mode, label: "Proposal ID", icon: Hash },
    { key: "calldata" as Mode, label: "Calldata", icon: FileCode },
    { key: "json" as Mode, label: "JSON", icon: Braces },
  ];

  return (
    <div>
      {/* Mode selector */}
      <div className="flex gap-2 mb-6">
        {modes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setMode(key); setError(null); }}
            disabled={submitting}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              mode === key
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Inputs */}
      {mode === "id" && (
        <div className="relative">
          <input
            type="number"
            min="0"
            placeholder="Enter proposal ID and press Enter"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            autoFocus
            data-testid="proposal-id-input"
            className="w-full h-14 pl-5 pr-14 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 outline-none text-lg text-slate-900 placeholder:text-slate-400 transition-all disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={submitting || !proposalId}
            data-testid="decode-submit-button"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </button>
        </div>
      )}

      {mode === "calldata" && (
        <div className="space-y-4">
          <textarea
            placeholder="Paste propose() calldata (0x...) and press Enter"
            value={calldata}
            onChange={(e) => setCalldata(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            autoFocus
            rows={6}
            className="w-full px-5 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 outline-none font-mono text-sm text-slate-900 placeholder:text-slate-400 resize-none transition-all disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={submitting || !calldata.trim()}
            className="h-12 px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium rounded-xl flex items-center gap-2 transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Decode
          </button>
        </div>
      )}

      {mode === "json" && (
        <div className="space-y-4">
          <textarea
            placeholder={`{
  "targets": ["0x..."],
  "values": ["0"],
  "calldatas": ["0x..."]
}`}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            disabled={submitting}
            autoFocus
            rows={10}
            className="w-full px-5 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 outline-none font-mono text-sm text-slate-900 placeholder:text-slate-400 resize-none transition-all disabled:opacity-50"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Press ⌘+Enter to decode</span>
            <button
              onClick={submit}
              disabled={submitting || !jsonInput.trim()}
              className="h-12 px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium rounded-xl flex items-center gap-2 transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Decode
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-4 text-sm text-red-600" data-testid="decode-error">{error}</p>
      )}

      {/* Hint for ID mode */}
      {mode === "id" && !error && (
        <p className="mt-3 text-sm text-slate-400">
          Press Enter to decode
        </p>
      )}
    </div>
  );
}
