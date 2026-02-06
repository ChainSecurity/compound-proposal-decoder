"use client";

import * as React from "react";
import { Copy, Check, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type {
  SerializedDecodedFunction,
  SourcedSerializedDecodedFunction,
  SerializableParamInfo,
  AddressMetadataMap,
  SourcedAddressMetadataMap,
  DataSource,
  Sourced,
} from "@/types/decoder";
import { isSourced, unwrap, getSource } from "@/types/decoder";
import { SourceTooltip, SourcedValue } from "@/components/ui/source-tooltip";

interface FunctionDetailsProps {
  decoded: SerializedDecodedFunction | SourcedSerializedDecodedFunction;
  chainId?: number;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getExplorerUrl(address: string, chainId: number = 1): string {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    10: "https://optimistic.etherscan.io",
    137: "https://polygonscan.com",
    2020: "https://app.roninchain.com",
    5000: "https://mantlescan.xyz",
    8453: "https://basescan.org",
    42161: "https://arbiscan.io",
    59144: "https://lineascan.build",
    534352: "https://scrollscan.com",
  };
  return `${explorers[chainId] ?? "https://etherscan.io"}/address/${address}`;
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHexString(value: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

// Wrap a value with SourceTooltip if it has source tracking
function MaybeSourced({
  value,
  children,
}: {
  value: unknown;
  children: React.ReactNode;
}): React.ReactElement {
  if (isSourced(value)) {
    return <SourceTooltip source={value.source}>{children}</SourceTooltip>;
  }
  return <>{children}</>;
}

// Get the underlying value from a potentially sourced value
function getValue<T>(val: T | Sourced<T>): T {
  return isSourced(val) ? val.value : val;
}

// Copyable wrapper component
function Copyable({ value, children }: { value: string; children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1.5 group">
      {children}
      <button
        onClick={copy}
        className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

function AddressValue({
  address,
  label,
  labelSource,
  chainId,
}: {
  address: string;
  label?: string | null;
  labelSource?: DataSource;
  chainId?: number;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const labelElement = label ? (
    labelSource ? (
      <SourceTooltip source={labelSource}>
        <span className="text-slate-500 cursor-help">({label})</span>
      </SourceTooltip>
    ) : (
      <span className="text-slate-500">({label})</span>
    )
  ) : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="font-mono text-slate-900">{truncateAddress(address)}</code>
      {labelElement}
      <button onClick={copy} className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <a
        href={getExplorerUrl(address, chainId)}
        target="_blank"
        rel="noopener noreferrer"
        className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </span>
  );
}

// Number display with multiple format options
function NumberValue({ value }: { value: string | bigint }) {
  const [format, setFormat] = React.useState<"decimal" | "hex" | "eth">("decimal");
  const [copied, setCopied] = React.useState(false);

  const big = typeof value === "bigint" ? value : BigInt(value);
  const decimal = big.toString(10);
  const hex = "0x" + big.toString(16);
  const formattedDecimal = decimal.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Check if it's likely a wei value (> 1e12)
  const isLikelyWei = big > 1_000_000_000_000n;
  const ethValue = isLikelyWei ? (Number(big) / 1e18).toFixed(6).replace(/\.?0+$/, "") : null;

  const copy = () => {
    const copyValue = format === "hex" ? hex : format === "eth" && ethValue ? ethValue : decimal;
    navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cycleFormat = () => {
    if (format === "decimal") setFormat(isLikelyWei ? "eth" : "hex");
    else if (format === "eth") setFormat("hex");
    else setFormat("decimal");
  };

  return (
    <span className="inline-flex items-center gap-2 group">
      <button
        onClick={cycleFormat}
        className="font-mono text-slate-900 hover:text-slate-600 transition-colors text-left"
        title="Click to change format"
      >
        {format === "decimal" && formattedDecimal}
        {format === "hex" && hex}
        {format === "eth" && ethValue && `${ethValue} ETH`}
      </button>
      <span className="text-xs text-slate-400">
        {format === "decimal" && isLikelyWei && "(wei)"}
        {format === "decimal" && !isLikelyWei && "(dec)"}
        {format === "hex" && "(hex)"}
        {format === "eth" && "(≈)"}
      </span>
      <button
        onClick={copy}
        className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

// Expandable bytes/long string display
function BytesValue({ value }: { value: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const isLong = value.length > 66;

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isLong) {
    return (
      <Copyable value={value}>
        <code className="font-mono text-slate-600 break-all">{value}</code>
      </Copyable>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm shrink-0"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {expanded ? "Collapse" : "Expand"} ({value.length} chars)
        </button>
        <button
          onClick={copy}
          className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <code className="block font-mono text-sm text-slate-600 break-all bg-white border border-slate-200 rounded-lg p-3">
        {expanded ? value : `${value.slice(0, 66)}...`}
      </code>
    </div>
  );
}

// String value with copy
function StringValue({ value }: { value: string }) {
  // Check if it's a large number string
  if (/^\d+$/.test(value) && value.length > 10) {
    return <NumberValue value={value} />;
  }

  return (
    <Copyable value={value}>
      <span className="font-mono text-slate-700">{value}</span>
    </Copyable>
  );
}

function renderValue(
  value: unknown,
  paramInfo: SerializableParamInfo | undefined,
  addressMetadata?: AddressMetadataMap | SourcedAddressMetadataMap,
  chainId?: number,
  depth: number = 0,
  typeString?: string, // Full type string with names, e.g. "(address asset, uint256 amount)"
  argSource?: DataSource // Source for this argument (from calldata)
): React.ReactNode {
  // If value is sourced, unwrap it and use its source
  const source = isSourced(value) ? value.source : argSource;
  const unwrappedValue = isSourced(value) ? value.value : value;

  // Helper to wrap result with source tooltip
  const wrapWithSource = (node: React.ReactNode): React.ReactNode => {
    if (source) {
      return <SourceTooltip source={source}>{node}</SourceTooltip>;
    }
    return node;
  };

  // Address
  if ((paramInfo?.baseType === "address" || isAddress(unwrappedValue)) && isAddress(unwrappedValue)) {
    const meta = addressMetadata?.[unwrappedValue];
    // Get label, handling both sourced and non-sourced metadata
    const contractName = meta?.contractName;
    const etherscanLabel = meta?.etherscanLabel;
    const labelValue = getValue(contractName) || getValue(etherscanLabel);
    // Get label source - prefer contractName source, then etherscanLabel source
    const labelSource = isSourced(contractName)
      ? contractName.source
      : isSourced(etherscanLabel)
        ? etherscanLabel.source
        : undefined;
    // Use per-address chainId from metadata if available (e.g., bridge target addresses)
    const addressChainId = meta?.chainId ?? chainId;
    return wrapWithSource(
      <AddressValue address={unwrappedValue} label={labelValue} labelSource={labelSource} chainId={addressChainId} />
    );
  }

  // Numbers
  if (paramInfo?.baseType === "uint" || paramInfo?.baseType === "int" || paramInfo?.type?.match(/^u?int/)) {
    if (typeof unwrappedValue === "string" || typeof unwrappedValue === "bigint") {
      return wrapWithSource(<NumberValue value={unwrappedValue} />);
    }
  }

  // Boolean
  if (paramInfo?.baseType === "bool") {
    return wrapWithSource(
      <span className={`font-semibold ${unwrappedValue ? "text-emerald-600" : "text-red-600"}`}>
        {String(unwrappedValue)}
      </span>
    );
  }

  // Tuples (check BEFORE arrays since JSON-serialized tuples are arrays)
  if (paramInfo?.baseType === "tuple" && paramInfo.components && unwrappedValue && typeof unwrappedValue === "object") {
    // Get values - prefer named properties if available
    const valueObj = unwrappedValue as Record<string, unknown>;

    // Try to get field names from typeString if components don't have names
    const parsedNames = typeString ? parseTupleFieldNames(typeString) : [];

    return (
      <div className="space-y-3 mt-2">
        {paramInfo.components.map((comp, idx) => {
          // Try to get value by name first, then by index
          const compName = comp.name || parsedNames[idx] || "";
          const fieldValue = compName && compName in valueObj
            ? valueObj[compName]
            : Array.isArray(unwrappedValue)
              ? unwrappedValue[idx]
              : Object.values(valueObj)[idx];

          // Get field name - prefer component name, then parsed name, then index
          const fieldName = comp.name || parsedNames[idx] || `[${idx}]`;

          // Field names come from ABI, so they share the same source
          const fieldNameElement = source ? (
            <SourceTooltip source={source}>
              <span className="font-medium text-slate-700 cursor-help">{fieldName}</span>
            </SourceTooltip>
          ) : (
            <span className="font-medium text-slate-700">{fieldName}</span>
          );

          const fieldTypeElement = source ? (
            <SourceTooltip source={source}>
              <span className="text-slate-400 ml-2 text-xs font-mono cursor-help">{comp.type}</span>
            </SourceTooltip>
          ) : (
            <span className="text-slate-400 ml-2 text-xs font-mono">{comp.type}</span>
          );

          return (
            <div key={idx} className="pl-4 border-l-2 border-slate-200">
              <div className="text-sm mb-1">
                {fieldNameElement}
                {fieldTypeElement}
              </div>
              <div>{renderValue(fieldValue, comp, addressMetadata, chainId, depth + 1, comp.type, source)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // Arrays (after tuples check)
  if (Array.isArray(unwrappedValue)) {
    if (unwrappedValue.length === 0) {
      return wrapWithSource(<span className="text-slate-400 italic">empty array</span>);
    }

    // For tuple arrays, get the item type info from arrayChildren
    const itemParamInfo = paramInfo?.arrayChildren;
    // Parse item type from typeString if available (e.g., "address[]" -> "address")
    const itemTypeStr = typeString?.replace(/\[\d*\]$/, "") || "";

    return (
      <div className="space-y-2 mt-2">
        {unwrappedValue.map((item, idx) => {
          // Array index indicates position in calldata
          const indexElement = source ? (
            <SourceTooltip source={source}>
              <span className="text-slate-400 font-mono text-sm shrink-0 cursor-help">[{idx}]</span>
            </SourceTooltip>
          ) : (
            <span className="text-slate-400 font-mono text-sm shrink-0">[{idx}]</span>
          );

          return (
            <div key={idx} className="flex items-start gap-3 pl-4 border-l-2 border-slate-200">
              {indexElement}
              <div className="min-w-0 flex-1">
                {renderValue(item, itemParamInfo, addressMetadata, chainId, depth + 1, itemTypeStr, source)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Generic objects (when no paramInfo available) - filter out numeric keys that duplicate named keys
  if (unwrappedValue && typeof unwrappedValue === "object") {
    const valueObj = unwrappedValue as Record<string, unknown>;
    const entries = Object.entries(valueObj);

    // Filter out numeric keys if we have named keys (ethers returns both)
    const namedEntries = entries.filter(([key]) => !/^\d+$/.test(key));
    const numericEntries = entries.filter(([key]) => /^\d+$/.test(key));

    // If typeString looks like a tuple, try to parse field names from it
    const isTupleType = typeString?.startsWith("(");
    const parsedNames = isTupleType ? parseTupleFieldNames(typeString!) : [];
    const parsedTypes = isTupleType ? parseTupleFieldTypes(typeString!) : [];

    // Prefer named entries, but if only numeric keys exist and we have parsed names, use those
    let displayEntries: [string, unknown][];
    if (namedEntries.length > 0) {
      displayEntries = namedEntries;
    } else if (parsedNames.length > 0 && parsedNames.some(n => n)) {
      // Use parsed names from typeString for numeric entries
      displayEntries = numericEntries.map(([key, val], idx) => {
        const name = parsedNames[idx] || key;
        return [name, val] as [string, unknown];
      });
    } else {
      displayEntries = entries;
    }

    if (displayEntries.length === 0) {
      return wrapWithSource(<span className="text-slate-400 italic">empty object</span>);
    }

    return (
      <div className="space-y-2 mt-2">
        {displayEntries.map(([key, val], idx) => {
          const fieldType = parsedTypes[idx] || "";

          // Field names come from ABI/signature
          const keyElement = source ? (
            <SourceTooltip source={source}>
              <span className="font-medium text-slate-700 cursor-help">{key}</span>
            </SourceTooltip>
          ) : (
            <span className="font-medium text-slate-700">{key}</span>
          );

          const typeElement = fieldType ? (
            source ? (
              <SourceTooltip source={source}>
                <span className="text-slate-400 ml-2 text-xs font-mono cursor-help">{fieldType}</span>
              </SourceTooltip>
            ) : (
              <span className="text-slate-400 ml-2 text-xs font-mono">{fieldType}</span>
            )
          ) : null;

          return (
            <div key={idx} className="pl-4 border-l-2 border-slate-200">
              <div className="text-sm mb-1">
                {keyElement}
                {typeElement}
              </div>
              <div>{renderValue(val, undefined, addressMetadata, chainId, depth + 1, undefined, source)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // Bytes
  if (paramInfo?.type?.startsWith("bytes")) {
    return wrapWithSource(<BytesValue value={String(unwrappedValue)} />);
  }

  // String fallbacks
  const str = String(unwrappedValue);

  // Check if it's an address
  if (isAddress(str)) {
    const meta = addressMetadata?.[str];
    const labelValue = meta ? getValue(meta.contractName) : undefined;
    const addressChainId = meta?.chainId ?? chainId;
    return wrapWithSource(
      <AddressValue address={str} label={labelValue} chainId={addressChainId} />
    );
  }

  // Check if it's a hex string (likely bytes)
  if (isHexString(str) && (str as string).length > 42) {
    return wrapWithSource(<BytesValue value={str} />);
  }

  // Check if it's a large number
  if (/^\d+$/.test(str) && (str as string).length > 10) {
    return wrapWithSource(<NumberValue value={str} />);
  }

  return wrapWithSource(<StringValue value={str} />);
}

// Simple type coloring - just two categories for cleaner look
function getTypeColor(type: string): string {
  // Addresses are special - blue
  if (type === "address") return "text-blue-600";
  // Everything else - purple/violet
  return "text-violet-600";
}

// Highlight a Solidity type with clean, minimal coloring
function HighlightedType({ type }: { type: string }): React.ReactElement {
  // Handle arrays: type[], type[n]
  const arrayMatch = type.match(/^(.+?)(\[.*\])$/);
  if (arrayMatch) {
    const [, baseType, brackets] = arrayMatch;
    return (
      <>
        <HighlightedType type={baseType} />
        <span className="text-slate-400">{brackets}</span>
      </>
    );
  }

  // Handle tuples: (type1, type2, ...)
  if (type.startsWith("(") && type.endsWith(")")) {
    const inner = type.slice(1, -1);
    const types = splitAtTopLevel(inner, ",");

    return (
      <>
        <span className="text-slate-400">(</span>
        {types.map((t, i) => (
          <span key={i}>
            {i > 0 && <span className="text-slate-400">, </span>}
            <HighlightedType type={t.trim()} />
          </span>
        ))}
        <span className="text-slate-400">)</span>
      </>
    );
  }

  // Simple type
  return <span className={getTypeColor(type)}>{type}</span>;
}

// Split string by delimiter, but only at top level (not inside parentheses/brackets)
function splitAtTopLevel(str: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of str) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;

    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);
  return parts;
}

// Parse parameter name from a full type string like "address owner" or "(address, uint256) config"
function parseParamName(typeStr: string): string {
  const trimmed = typeStr.trim();
  let depth = 0;
  let lastSpaceIdx = -1;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "(" || trimmed[i] === "[") depth++;
    if (trimmed[i] === ")" || trimmed[i] === "]") depth--;
    if (trimmed[i] === " " && depth === 0) lastSpaceIdx = i;
  }

  if (lastSpaceIdx > 0) {
    const potentialName = trimmed.slice(lastSpaceIdx + 1);
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(potentialName) && !["memory", "storage", "calldata"].includes(potentialName)) {
      return potentialName;
    }
  }
  return "";
}

// Parse parameter type from a full type string (removes the name)
function parseParamType(typeStr: string): string {
  const trimmed = typeStr.trim();
  let depth = 0;
  let lastSpaceIdx = -1;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "(" || trimmed[i] === "[") depth++;
    if (trimmed[i] === ")" || trimmed[i] === "]") depth--;
    if (trimmed[i] === " " && depth === 0) lastSpaceIdx = i;
  }

  if (lastSpaceIdx > 0) {
    const potentialName = trimmed.slice(lastSpaceIdx + 1);
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(potentialName) && !["memory", "storage", "calldata"].includes(potentialName)) {
      return trimmed.slice(0, lastSpaceIdx);
    }
  }
  return trimmed;
}

// Parse tuple field names from a type string like "(address asset, uint256 amount)"
function parseTupleFieldNames(typeStr: string): string[] {
  // Check if it's a tuple type
  if (!typeStr.startsWith("(")) return [];

  // Find the matching closing paren
  let depth = 0;
  let tupleEnd = -1;
  for (let i = 0; i < typeStr.length; i++) {
    if (typeStr[i] === "(") depth++;
    if (typeStr[i] === ")") {
      depth--;
      if (depth === 0) {
        tupleEnd = i;
        break;
      }
    }
  }

  if (tupleEnd === -1) return [];

  const inner = typeStr.slice(1, tupleEnd);
  const fields = splitAtTopLevel(inner, ",");

  return fields.map(field => {
    const trimmed = field.trim();
    // Parse "type name" or just "type"
    // Need to handle nested tuples: "(type1, type2) name"
    let depth = 0;
    let lastSpaceIdx = -1;

    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "(" || trimmed[i] === "[") depth++;
      if (trimmed[i] === ")" || trimmed[i] === "]") depth--;
      if (trimmed[i] === " " && depth === 0) lastSpaceIdx = i;
    }

    if (lastSpaceIdx > 0) {
      const potentialName = trimmed.slice(lastSpaceIdx + 1);
      // Check it's a valid identifier (not a type modifier like "memory")
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(potentialName) && !["memory", "storage", "calldata"].includes(potentialName)) {
        return potentialName;
      }
    }
    return "";
  });
}

// Parse tuple field types from a type string like "(address asset, uint256 amount)"
function parseTupleFieldTypes(typeStr: string): string[] {
  // Check if it's a tuple type
  if (!typeStr.startsWith("(")) return [];

  // Find the matching closing paren
  let depth = 0;
  let tupleEnd = -1;
  for (let i = 0; i < typeStr.length; i++) {
    if (typeStr[i] === "(") depth++;
    if (typeStr[i] === ")") {
      depth--;
      if (depth === 0) {
        tupleEnd = i;
        break;
      }
    }
  }

  if (tupleEnd === -1) return [];

  const inner = typeStr.slice(1, tupleEnd);
  const fields = splitAtTopLevel(inner, ",");

  return fields.map(field => {
    const trimmed = field.trim();
    // Parse "type name" -> return "type"
    let depth = 0;
    let lastSpaceIdx = -1;

    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "(" || trimmed[i] === "[") depth++;
      if (trimmed[i] === ")" || trimmed[i] === "]") depth--;
      if (trimmed[i] === " " && depth === 0) lastSpaceIdx = i;
    }

    if (lastSpaceIdx > 0) {
      const potentialName = trimmed.slice(lastSpaceIdx + 1);
      // Check it's a valid identifier (not a type modifier like "memory")
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(potentialName) && !["memory", "storage", "calldata"].includes(potentialName)) {
        return trimmed.slice(0, lastSpaceIdx);
      }
    }
    return trimmed;
  });
}

// Formatted function signature with syntax highlighting
function FormattedSignature({
  signature,
  selector,
  signatureSource,
  selectorSource
}: {
  signature: string;
  selector: string;
  signatureSource?: DataSource;
  selectorSource?: DataSource;
}) {
  const [copied, setCopied] = React.useState<"sig" | "sel" | null>(null);

  const copySignature = () => {
    navigator.clipboard.writeText(signature);
    setCopied("sig");
    setTimeout(() => setCopied(null), 2000);
  };

  const copySelector = () => {
    navigator.clipboard.writeText(selector);
    setCopied("sel");
    setTimeout(() => setCopied(null), 2000);
  };

  // Parse the signature: functionName(params)
  const match = signature.match(/^(\w+)\((.*)\)$/s);
  if (!match) {
    return (
      <Copyable value={signature}>
        <code className="font-mono text-slate-800">{signature}</code>
      </Copyable>
    );
  }

  const [, funcName, paramsStr] = match;

  // Parse parameters into {type, name} pairs
  const parseParams = (str: string): Array<{ type: string; name?: string }> => {
    if (!str.trim()) return [];

    const params: Array<{ type: string; name?: string }> = [];
    let depth = 0;
    let current = "";

    for (const char of str) {
      if (char === "(" || char === "[") depth++;
      if (char === ")" || char === "]") depth--;

      if (char === "," && depth === 0) {
        if (current.trim()) params.push(parseParam(current.trim()));
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) params.push(parseParam(current.trim()));
    return params;
  };

  const parseParam = (param: string): { type: string; name?: string } => {
    // Find the last space that's not inside parentheses/brackets
    let depth = 0;
    let lastSpaceIdx = -1;

    for (let i = 0; i < param.length; i++) {
      const char = param[i];
      if (char === "(" || char === "[") depth++;
      if (char === ")" || char === "]") depth--;
      if (char === " " && depth === 0) lastSpaceIdx = i;
    }

    if (lastSpaceIdx > 0) {
      const type = param.slice(0, lastSpaceIdx);
      const name = param.slice(lastSpaceIdx + 1);
      // Check if name looks like a valid identifier
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        return { type, name };
      }
    }

    return { type: param };
  };

  const params = parseParams(paramsStr);

  // Wrap signature content with optional tooltip
  const signatureContent = (
    <code className="font-mono text-sm leading-relaxed">
      <span className="text-slate-900 font-semibold">{funcName}</span>
      <span className="text-slate-400">(</span>
      {params.map((param, idx) => (
        <span key={idx}>
          {idx > 0 && <span className="text-slate-400">, </span>}
          <HighlightedType type={param.type} />
          {param.name && (
            <span className="text-slate-500"> {param.name}</span>
          )}
        </span>
      ))}
      <span className="text-slate-400">)</span>
    </code>
  );

  const selectorContent = (
    <code className="text-xs font-mono text-slate-400">{selector}</code>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 group">
        {signatureSource ? (
          <SourceTooltip source={signatureSource}>{signatureContent}</SourceTooltip>
        ) : (
          signatureContent
        )}
        <button
          onClick={copySignature}
          className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          title="Copy signature"
        >
          {copied === "sig" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex items-center gap-2 group">
        {selectorSource ? (
          <SourceTooltip source={selectorSource}>{selectorContent}</SourceTooltip>
        ) : (
          selectorContent
        )}
        <button
          onClick={copySelector}
          className="p-0.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Copy selector"
        >
          {copied === "sel" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// Parse full param type strings from signature (preserving tuple field names)
function parseSignatureParams(signature: string): string[] {
  const match = signature.match(/^\w+\((.*)\)$/s);
  if (!match) return [];

  const paramsStr = match[1];
  if (!paramsStr.trim()) return [];

  const params: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of paramsStr) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth--;

    if (char === "," && depth === 0) {
      if (current.trim()) params.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) params.push(current.trim());
  return params;
}

export function FunctionDetails({ decoded, chainId }: FunctionDetailsProps) {
  const hasArgs = decoded.args && decoded.args.length > 0;

  // Parse full type strings from signature (includes tuple field names)
  const signatureValue = getValue(decoded.signature);
  const signatureParams = parseSignatureParams(signatureValue);

  // ABI source for argument names/types (same as signature source)
  const abiSource = isSourced(decoded.signature) ? decoded.signature.source : undefined;

  return (
    <div className="space-y-6">
      {/* Signature Card */}
      <div className="bg-slate-50 rounded-xl p-5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Function Signature
        </div>
        <FormattedSignature
          signature={signatureValue}
          selector={getValue(decoded.selector)}
          signatureSource={abiSource}
          selectorSource={isSourced(decoded.selector) ? decoded.selector.source : undefined}
        />
      </div>

      {/* Arguments */}
      {hasArgs && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Arguments</h4>
          <div className="space-y-4">
            {decoded.args.map((arg, idx) => {
              const paramInfo = decoded.argParamInfo?.[idx];
              // Prefer signature params (has tuple field names) over argTypes
              const argTypeStr = signatureParams[idx] || decoded.argTypes?.[idx] || "";
              // Parse name from argTypes (e.g., "address owner" -> "owner", "(address, uint256) config" -> "config")
              const parsedName = parseParamName(argTypeStr);
              const name = paramInfo?.name || parsedName || `arg${idx}`;
              const type = paramInfo?.type || parseParamType(argTypeStr) || "unknown";
              // Get source for this argument value if available
              const argSource = "argSources" in decoded ? (decoded as SourcedSerializedDecodedFunction).argSources?.[idx] : undefined;

              // Wrap name and type with ABI source tooltip
              const nameElement = abiSource ? (
                <SourceTooltip source={abiSource}>
                  <span className="font-semibold text-slate-800">{name}</span>
                </SourceTooltip>
              ) : (
                <span className="font-semibold text-slate-800">{name}</span>
              );

              const typeElement = abiSource ? (
                <SourceTooltip source={abiSource}>
                  <span className="text-xs font-mono text-slate-400">{type}</span>
                </SourceTooltip>
              ) : (
                <span className="text-xs font-mono text-slate-400">{type}</span>
              );

              return (
                <div key={idx} className="bg-slate-50 rounded-xl p-5">
                  <div className="flex items-baseline gap-3 mb-3">
                    {nameElement}
                    {typeElement}
                  </div>
                  <div className="text-slate-700">
                    {renderValue(arg, paramInfo, decoded.addressMetadata, chainId, 0, argTypeStr, argSource)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
