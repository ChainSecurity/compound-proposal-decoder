"use client";

import * as React from "react";
import { FileText, Layers, Wallet, Copy, Check, ExternalLink } from "lucide-react";
import type { SerializedDecodedProposal, Sourced } from "@/types/decoder";
import { isSourced } from "@/types/decoder";

// Helper to unwrap potentially sourced values
function getValue<T>(val: T | Sourced<T>): T {
  return isSourced(val) ? val.value : val;
}

interface ProposalOverviewProps {
  proposal: SerializedDecodedProposal;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function countChains(proposal: SerializedDecodedProposal): number {
  const chains = new Set<number>();
  function traverse(calls: typeof proposal.calls) {
    for (const call of calls) {
      chains.add(getValue(call.chainId));
      if (call.children) {
        traverse(call.children.map((c) => c.node));
      }
    }
  }
  traverse(proposal.calls);
  return chains.size;
}

export function ProposalOverview({ proposal }: ProposalOverviewProps) {
  const [copied, setCopied] = React.useState(false);
  const proposalId = getValue(proposal.proposalId);
  const governor = getValue(proposal.governor);
  const hasProposalId = proposalId !== "0";
  const chainCount = countChains(proposal);

  const copyGovernor = () => {
    navigator.clipboard.writeText(governor);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-1 gap-4" data-testid="proposal-overview">
      {/* Proposal ID */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-slate-600" />
          </div>
          <span className="text-sm font-medium text-slate-500">Proposal</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {hasProposalId ? `#${proposalId}` : "Custom"}
        </div>
      </div>

      {/* Actions Count */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Layers className="w-5 h-5 text-emerald-600" />
          </div>
          <span className="text-sm font-medium text-slate-500">Actions</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {proposal.calls.length}
        </div>
      </div>

      {/* Chains */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-500">Chains</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {chainCount}
        </div>
      </div>

      {/* Governor */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-sm font-medium text-slate-500">Governor</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-slate-700">
            {truncateAddress(governor)}
          </code>
          <button
            onClick={copyGovernor}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <a
            href={`https://etherscan.io/address/${governor}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
