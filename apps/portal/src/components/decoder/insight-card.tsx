import { Info, AlertTriangle, ExternalLink } from "lucide-react";
import type { CallInsight, SourcedCallInsight, DataSource } from "@/types/decoder";
import { isSourced, unwrap } from "@/types/decoder";
import { SourceTooltip } from "@/components/ui/source-tooltip";

interface InsightCardProps {
  insight: CallInsight | SourcedCallInsight;
}

// Check if title indicates a warning
function isWarning(title: string): boolean {
  return title.toLowerCase().includes("warning") || /[\u26A0\u{1F6A8}]/u.test(title);
}

// Strip emojis and clean up title
function cleanTitle(title: string): string {
  return title
    // Remove common warning/info emojis
    .replace(/[\u26A0\u{1F6A8}\u2139\u{1F4A1}\u{1F4DD}\u{2705}\u{274C}\u{26D4}]/gu, "")
    // Remove other emojis (broad pattern)
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    // Clean up extra spaces and trim
    .replace(/\s+/g, " ")
    .trim();
}

// Check if a string looks like an Ethereum address
function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

// Get explorer URL for an address
function getExplorerUrl(address: string, chainId: number): string {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    42161: "https://arbiscan.io",
    8453: "https://basescan.org",
    10: "https://optimistic.etherscan.io",
    137: "https://polygonscan.com",
    534352: "https://scrollscan.com",
    5000: "https://mantlescan.xyz",
    2020: "https://app.roninchain.com",
  };
  const base = explorers[chainId] ?? "https://etherscan.io";
  return `${base}/address/${address}`;
}

// Wrap content with SourceTooltip if source exists
function MaybeSourced({
  source,
  children,
}: {
  source?: DataSource;
  children: React.ReactNode;
}) {
  if (source) {
    return <SourceTooltip source={source}>{children}</SourceTooltip>;
  }
  return <>{children}</>;
}

export function InsightCard({ insight }: InsightCardProps) {
  const warn = isWarning(insight.title);
  const title = cleanTitle(insight.title);

  // Check if this is a sourced insight (has handler source)
  const handlerSource = "_handlerSource" in insight ? insight._handlerSource : undefined;

  return (
    <div className={`rounded-xl p-5 ${warn ? "bg-amber-50" : "bg-slate-50"}`}>
      <div className={`flex items-center gap-2 mb-4 ${warn ? "text-amber-700" : "text-slate-700"}`}>
        {warn ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <Info className="w-5 h-5 shrink-0" />}
        {handlerSource ? (
          <SourceTooltip source={handlerSource}>
            <span className="font-semibold cursor-help">{title}</span>
          </SourceTooltip>
        ) : (
          <span className="font-semibold">{title}</span>
        )}
      </div>
      <div className="space-y-2">
        {insight.entries.map((entry, idx) => {
          // Unwrap label and value
          const labelSrc = isSourced(entry.label) ? entry.label.source : undefined;
          const labelStr = cleanTitle(unwrap(entry.label));

          const valueSrc = isSourced(entry.value) ? entry.value.source : undefined;
          const valueStr = unwrap(entry.value);

          // Check for resolved name in metadata
          const resolvedName = entry.metadata?.resolvedName
            ? unwrap(entry.metadata.resolvedName)
            : undefined;
          const resolvedNameSrc = entry.metadata?.resolvedName && isSourced(entry.metadata.resolvedName)
            ? entry.metadata.resolvedName.source
            : undefined;

          const chainId = entry.metadata?.chainId ?? 1;
          const valueIsAddress = entry.metadata?.type === "address" || isAddress(valueStr);

          return (
            <div key={idx} className="grid grid-cols-[140px_1fr] gap-4 text-sm">
              <MaybeSourced source={labelSrc ?? handlerSource}>
                <span className={`font-medium ${warn ? "text-amber-600" : "text-slate-600"} ${labelSrc || handlerSource ? "cursor-help" : ""}`}>
                  {labelStr}
                </span>
              </MaybeSourced>
              <div className="flex items-center gap-2">
                {valueIsAddress ? (
                  <>
                    {resolvedName && (
                      <MaybeSourced source={resolvedNameSrc}>
                        <span className="text-slate-700 cursor-help">{resolvedName}</span>
                      </MaybeSourced>
                    )}
                    <MaybeSourced source={valueSrc}>
                      <span className="font-mono text-slate-500 break-all cursor-help text-xs">
                        {valueStr.slice(0, 6)}...{valueStr.slice(-4)}
                      </span>
                    </MaybeSourced>
                    <a
                      href={getExplorerUrl(valueStr, chainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-slate-600"
                      title="View on explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </>
                ) : (
                  <MaybeSourced source={valueSrc}>
                    <span className={`font-mono text-slate-700 break-all ${valueSrc ? "cursor-help" : ""}`}>
                      {valueStr}
                    </span>
                  </MaybeSourced>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
