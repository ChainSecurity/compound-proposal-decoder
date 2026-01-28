"use client";

import * as React from "react";
import {
  FileCode,
  Globe,
  Link,
  FileJson,
  Cpu,
  Sparkles,
  ExternalLink as ExternalLinkIcon,
  Copy,
  Check,
} from "lucide-react";
import type {
  DataSource,
  CalldataSource,
  EtherscanAbiSource,
  EtherscanTagSource,
  EtherscanSourcecodeSource,
  OnChainSource,
  StaticMetadataSource,
  HandlerSource,
  DerivedSource,
  ExternalApiSource,
  HardcodedSource,
  LocalAbiSource,
  ProposalParameterSource,
  Sourced,
} from "@/types/sources";
import { getExplorerUrl, getChainName, isSourced } from "@/types/sources";

// =============================================================================
// Types
// =============================================================================

interface SourceTooltipProps {
  /** The sourced value to display */
  source: DataSource;
  /** The children to wrap with the tooltip trigger */
  children: React.ReactNode;
}

interface SourcedValueProps<T> {
  /** The potentially sourced value */
  value: T | Sourced<T>;
  /** Render function for the unwrapped value */
  children: (value: T) => React.ReactNode;
}

// =============================================================================
// Source type configuration
// =============================================================================

type TrustLevel = "verified" | "trusted" | "unverified";

type SourceConfig = {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string; // Tailwind color class
  trust: TrustLevel;
};

function getTrustBadge(trust: TrustLevel) {
  switch (trust) {
    case "verified":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
          <Check className="w-3 h-3" />
          Verified
        </span>
      );
    case "trusted":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
          Trusted
        </span>
      );
    case "unverified":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
          Unverified
        </span>
      );
  }
}

function getSourceConfig(source: DataSource): SourceConfig {
  const iconClass = "w-4 h-4";

  switch (source.type) {
    case "calldata":
      return {
        icon: <FileCode className={iconClass} />,
        title: "From Proposal Calldata",
        description: "This value was extracted directly from the proposal's transaction data.",
        color: "text-blue-600",
        trust: "verified", // Calldata is the ground truth
      };
    case "etherscan-abi":
      return {
        icon: <Globe className={iconClass} />,
        title: "Contract ABI",
        description: "The function signature was decoded using the contract's verified ABI from Etherscan.",
        color: "text-emerald-600",
        trust: "verified", // Etherscan verified contracts
      };
    case "etherscan-tag":
      return {
        icon: <Globe className={iconClass} />,
        title: "Etherscan Label",
        description: "This name comes from Etherscan's public address labels.",
        color: "text-emerald-600",
        trust: "trusted", // Tags are curated but not verified
      };
    case "etherscan-sourcecode":
      return {
        icon: <Globe className={iconClass} />,
        title: "Verified Contract",
        description: "This contract name comes from Etherscan's verified source code.",
        color: "text-emerald-600",
        trust: "verified",
      };
    case "on-chain":
      return {
        icon: <Link className={iconClass} />,
        title: "On-Chain Data",
        description: "This value was fetched by querying the blockchain directly.",
        color: "text-purple-600",
        trust: "unverified", // On-chain data could be from untrusted contracts
      };
    case "static-metadata":
      return {
        icon: <FileJson className={iconClass} />,
        title: "Configuration File",
        description: "This value comes from Compound's deployment configuration files.",
        color: "text-amber-600",
        trust: "verified", // Our own config files
      };
    case "handler":
      return {
        icon: <Cpu className={iconClass} />,
        title: "Computed by Decoder",
        description: source.description || "This value was computed by the decoder's analysis logic.",
        color: "text-slate-600",
        trust: "trusted", // Our decoder logic
      };
    case "derived":
      return {
        icon: <Sparkles className={iconClass} />,
        title: "Derived Value",
        description: source.logic || "This value was computed from other data sources.",
        color: "text-indigo-600",
        trust: "trusted", // Derived from other sources
      };
    case "external-api":
      return {
        icon: <Globe className={iconClass} />,
        title: "External API",
        description: `This value was fetched from ${source.api === "defillama" ? "DefiLlama" : source.api}.`,
        color: "text-cyan-600",
        trust: "verified", // DefiLlama is a trusted source
      };
    case "hardcoded":
      return {
        icon: <FileJson className={iconClass} />,
        title: "Known Configuration",
        description: source.description || "This is a known value from the decoder's configuration.",
        color: "text-slate-600",
        trust: "verified", // Manually verified by us
      };
    case "local-abi":
      return {
        icon: <FileJson className={iconClass} />,
        title: "Local ABI",
        description: "The function was decoded using a bundled ABI file (Etherscan ABI not available).",
        color: "text-orange-600",
        trust: "trusted", // Our bundled ABIs
      };
    case "proposal-parameter":
      return {
        icon: <FileCode className={iconClass} />,
        title: "Proposal Parameter",
        description: `This value comes from the proposal's ${source.parameter}[] array (action #${source.index + 1}).`,
        color: "text-blue-600",
        trust: "verified", // Direct from proposal
      };
    default:
      return {
        icon: <FileCode className={iconClass} />,
        title: "Data Source",
        description: "Origin of this value.",
        color: "text-slate-600",
        trust: "unverified",
      };
  }
}

// =============================================================================
// Copy button
// =============================================================================

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
      title={label ?? "Copy"}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-600" />
          <span className="text-emerald-600">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>{label ?? "Copy"}</span>
        </>
      )}
    </button>
  );
}

// =============================================================================
// Source-specific detail renderers
// =============================================================================

function CalldataDetails({ source }: { source: CalldataSource }) {
  const truncatedBytes =
    source.rawBytes.length > 50
      ? `${source.rawBytes.slice(0, 26)}...${source.rawBytes.slice(-20)}`
      : source.rawBytes;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>Byte {source.offset}–{source.offset + source.length}</span>
        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">
          {source.encoding.toUpperCase()}
        </span>
      </div>
      <div className="bg-slate-50 rounded-lg p-3">
        <code className="text-xs font-mono text-slate-700 break-all">{truncatedBytes}</code>
      </div>
      <CopyButton value={source.rawBytes} label="Copy raw bytes" />
    </div>
  );
}

function EtherscanDetails({ source }: { source: EtherscanAbiSource | EtherscanTagSource | EtherscanSourcecodeSource }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Chain:</span>
        <span className="font-medium text-slate-700">{getChainName(source.chainId)}</span>
      </div>
      <div className="bg-slate-50 rounded-lg p-3">
        <code className="text-xs font-mono text-slate-600">{source.address}</code>
      </div>
      <div className="flex gap-2">
        <CopyButton value={source.address} label="Copy" />
        <a
          href={getExplorerUrl(source.chainId, source.address)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          <ExternalLinkIcon className="w-3 h-3" />
          <span>View on Explorer</span>
        </a>
      </div>
    </div>
  );
}

function OnChainDetails({ source }: { source: OnChainSource }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-slate-500">Chain:</span>
        <span className="font-medium text-slate-700">{getChainName(source.chainId)}</span>
      </div>
      <div className="bg-slate-50 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Contract:</span>
          <code className="text-xs font-mono text-slate-600">{source.target.slice(0, 10)}...{source.target.slice(-8)}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Method:</span>
          <code className="text-xs font-mono text-purple-600 font-medium">{source.method}</code>
        </div>
      </div>
      <details className="group">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
          Replicate with cast command
        </summary>
        <div className="mt-2 bg-slate-800 rounded-lg p-3">
          <code className="text-xs font-mono text-amber-300 break-all">{source.castCommand}</code>
        </div>
        <div className="mt-2">
          <CopyButton value={source.castCommand} label="Copy command" />
        </div>
      </details>
    </div>
  );
}

function ConfigFileDetails({ source }: { source: StaticMetadataSource }) {
  return (
    <div className="space-y-3">
      {source.market && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Market:</span>
          <span className="font-medium text-slate-700">{source.market}</span>
        </div>
      )}
      <div className="bg-slate-50 rounded-lg p-3 space-y-1">
        <div className="text-xs text-slate-500">File path:</div>
        <code className="text-xs font-mono text-slate-600 break-all">{source.filePath}</code>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Key:</span>
        <code className="font-mono text-emerald-600">{source.key}</code>
      </div>
    </div>
  );
}

function HandlerDetails({ source }: { source: HandlerSource }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Handler:</span>
        <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{source.handlerName}</code>
      </div>
    </div>
  );
}

function ExternalApiDetails({ source }: { source: ExternalApiSource }) {
  const apiName = source.api === "defillama" ? "DefiLlama" : source.api;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Provider:</span>
        <span className="font-medium text-slate-700">{apiName}</span>
      </div>
      <details className="group">
        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
          View API endpoint
        </summary>
        <div className="mt-2 bg-slate-50 rounded-lg p-3">
          <code className="text-xs font-mono text-slate-600 break-all">{source.endpoint}</code>
        </div>
        <div className="mt-2">
          <CopyButton value={source.endpoint} label="Copy URL" />
        </div>
      </details>
    </div>
  );
}

function KnownConfigDetails({ source }: { source: HardcodedSource }) {
  // Extract a friendlier file name from the location
  const fileName = source.location.split("/").pop() || source.location;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Defined in:</span>
        <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{fileName}</code>
      </div>
    </div>
  );
}

function LocalAbiDetails({ source }: { source: LocalAbiSource }) {
  const fileName = source.filePath.split("/").pop() || source.filePath;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">ABI file:</span>
        <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{fileName}</code>
      </div>
      {source.contractName && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Contract:</span>
          <span className="font-medium text-slate-700">{source.contractName}</span>
        </div>
      )}
    </div>
  );
}

function DerivedDetails({ source }: { source: DerivedSource }) {
  return (
    <div className="space-y-2">
      {source.inputs.length > 0 && (
        <div className="text-xs text-slate-500">
          Computed from {source.inputs.length} input{source.inputs.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

function ProposalParameterDetails({ source }: { source: ProposalParameterSource }) {
  const parameterLabel = {
    targets: "Target Address",
    values: "ETH Value (wei)",
    calldatas: "Call Data",
  }[source.parameter];

  const truncatedValue =
    source.rawValue.length > 50
      ? `${source.rawValue.slice(0, 26)}...${source.rawValue.slice(-20)}`
      : source.rawValue;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-slate-500">Parameter:</span>
        <code className="font-mono text-blue-600 font-medium">{source.parameter}[{source.index}]</code>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-slate-500">Type:</span>
        <span className="font-medium text-slate-700">{parameterLabel}</span>
      </div>
      <div className="bg-slate-50 rounded-lg p-3">
        <code className="text-xs font-mono text-slate-700 break-all">{truncatedValue}</code>
      </div>
      <CopyButton value={source.rawValue} label="Copy raw value" />
    </div>
  );
}

function SourceDetails({ source }: { source: DataSource }) {
  switch (source.type) {
    case "calldata":
      return <CalldataDetails source={source} />;
    case "etherscan-abi":
    case "etherscan-tag":
    case "etherscan-sourcecode":
      return <EtherscanDetails source={source} />;
    case "on-chain":
      return <OnChainDetails source={source} />;
    case "static-metadata":
      return <ConfigFileDetails source={source} />;
    case "handler":
      return <HandlerDetails source={source} />;
    case "derived":
      return <DerivedDetails source={source} />;
    case "external-api":
      return <ExternalApiDetails source={source} />;
    case "hardcoded":
      return <KnownConfigDetails source={source} />;
    case "local-abi":
      return <LocalAbiDetails source={source} />;
    case "proposal-parameter":
      return <ProposalParameterDetails source={source} />;
  }
}

// =============================================================================
// Debug mode hook
// =============================================================================

function useSourceDebugMode(): boolean {
  const [debug, setDebug] = React.useState(false);

  React.useEffect(() => {
    // Check URL query param
    const params = new URLSearchParams(window.location.search);
    setDebug(params.get("debug-sources") === "true");
  }, []);

  return debug;
}

// =============================================================================
// Main component
// =============================================================================

/**
 * SourceTooltip wraps a value and shows a tooltip with source information on hover.
 *
 * Debug mode: Add ?debug-sources=true to the URL to highlight all sourced values with a red overlay.
 */
export function SourceTooltip({ source, children }: SourceTooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const debugMode = useSourceDebugMode();

  const updatePosition = React.useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Use viewport-relative positioning (fixed)
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left - 100, window.innerWidth - 328)),
      });
    }
  }, []);

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsOpen(true);
    }, 150);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 100);
  };

  const keepTooltipOpen = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  // Update position on scroll/resize while tooltip is open
  React.useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const config = getSourceConfig(source);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className={`cursor-help ${debugMode ? "ring-2 ring-red-500 bg-red-500/20 rounded-sm" : ""}`}
      >
        {children}
      </span>
      {isOpen && position && (
        <div
          ref={tooltipRef}
          onMouseEnter={keepTooltipOpen}
          onMouseLeave={hideTooltip}
          className="fixed z-50 w-80 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden"
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {/* Header */}
          <div className={`flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 ${config.color}`}>
            {config.icon}
            <span className="font-semibold text-sm text-slate-800 flex-1">{config.title}</span>
            {getTrustBadge(config.trust)}
          </div>
          {/* Description */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs text-slate-600 leading-relaxed">{config.description}</p>
          </div>
          {/* Details */}
          <div className="p-4">
            <SourceDetails source={source} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * SourcedValue renders a value with optional source tooltip.
 * If the value is sourced, wraps with SourceTooltip.
 * If not sourced, renders children directly.
 */
export function SourcedValue<T>({ value, children }: SourcedValueProps<T>) {
  if (isSourced(value)) {
    return (
      <SourceTooltip source={value.source}>
        {children(value.value)}
      </SourceTooltip>
    );
  }
  return <>{children(value)}</>;
}

/**
 * Utility component for rendering a string with optional source.
 */
export function SourcedText({
  value,
  className,
}: {
  value: string | Sourced<string>;
  className?: string;
}) {
  return (
    <SourcedValue value={value}>
      {(v) => <span className={className}>{v}</span>}
    </SourcedValue>
  );
}
