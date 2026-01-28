import type {
  AppConfig,
  ChainConfig,
  ConfigWarning,
  WarningSeverity,
} from "@/types/config";

const PLACEHOLDER_PATTERNS = [
  /your-/i,
  /<your-/i,
  /-here$/i,
  /example\.com/i,
  /placeholder/i,
];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function addWarning(
  warnings: ConfigWarning[],
  severity: WarningSeverity,
  field: string,
  message: string,
  chain?: string
): void {
  warnings.push({ severity, field, message, chain });
}

export function validateChainConfig(
  chainName: string,
  chain: ChainConfig
): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // Required field: rpcUrl
  if (!chain.rpcUrl) {
    addWarning(
      warnings,
      "error",
      "rpcUrl",
      "RPC URL is required for decoder functionality",
      chainName
    );
  } else if (isPlaceholder(chain.rpcUrl)) {
    addWarning(
      warnings,
      "error",
      "rpcUrl",
      "RPC URL contains placeholder value",
      chainName
    );
  }

  // Required field: timelockAddress (for most chains)
  if (!chain.timelockAddress) {
    addWarning(
      warnings,
      "warning",
      "timelockAddress",
      "Timelock address not configured",
      chainName
    );
  }

  // Optional but important: simulatorRpcUrl
  if (!chain.simulatorRpcUrl) {
    addWarning(
      warnings,
      "info",
      "simulatorRpcUrl",
      "Simulator RPC URL not configured - simulation unavailable for this chain",
      chainName
    );
  } else if (isPlaceholder(chain.simulatorRpcUrl)) {
    addWarning(
      warnings,
      "warning",
      "simulatorRpcUrl",
      "Simulator RPC URL contains placeholder value",
      chainName
    );
  }

  return warnings;
}

export function validateConfig(config: AppConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];

  // Global: etherscanApiKey
  if (!config.etherscanApiKey) {
    addWarning(
      warnings,
      "error",
      "etherscanApiKey",
      "Etherscan API key is required for contract verification"
    );
  } else if (isPlaceholder(config.etherscanApiKey)) {
    addWarning(
      warnings,
      "error",
      "etherscanApiKey",
      "Etherscan API key contains placeholder value"
    );
  }

  // Validate each chain
  for (const [chainName, chainConfig] of Object.entries(config.chains)) {
    const chainWarnings = validateChainConfig(chainName, chainConfig);
    warnings.push(...chainWarnings);
  }

  // Validate defaults
  if (!config.defaults.robinhood) {
    addWarning(
      warnings,
      "warning",
      "defaults.robinhood",
      "Robinhood address not configured - simulation may fail"
    );
  }

  if (!config.defaults.COMP) {
    addWarning(
      warnings,
      "warning",
      "defaults.COMP",
      "COMP token address not configured"
    );
  }

  return warnings;
}

export function getChainStatus(
  chain: ChainConfig
): "configured" | "partial" | "not-configured" {
  const hasRpc = chain.rpcUrl && !isPlaceholder(chain.rpcUrl);
  const hasSimulator =
    chain.simulatorRpcUrl && !isPlaceholder(chain.simulatorRpcUrl);
  const hasTimelock = !!chain.timelockAddress;

  if (hasRpc && hasSimulator && hasTimelock) {
    return "configured";
  } else if (hasRpc || hasTimelock) {
    return "partial";
  }
  return "not-configured";
}

export function sortWarnings(warnings: ConfigWarning[]): ConfigWarning[] {
  const severityOrder: Record<WarningSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return [...warnings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
}

export function groupWarningsBySeverity(
  warnings: ConfigWarning[]
): Record<WarningSeverity, ConfigWarning[]> {
  return {
    error: warnings.filter((w) => w.severity === "error"),
    warning: warnings.filter((w) => w.severity === "warning"),
    info: warnings.filter((w) => w.severity === "info"),
  };
}

export function hasFieldPlaceholder(value: string | undefined): boolean {
  return isPlaceholder(value);
}
