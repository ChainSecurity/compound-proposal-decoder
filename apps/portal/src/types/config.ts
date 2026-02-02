/**
 * TypeScript interfaces for compound-config.json
 */

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  simulatorRpcUrl?: string;
  directory: string;
  governorAddress?: string;
  timelockAddress?: string;
  bridge?: string;
  receiver?: string;
  l2msgsender?: string;
}

export interface DefaultsConfig {
  gas: string;
  gasPrice: string;
  robinhood: string;
  COMP: string;
}

export interface AppConfig {
  etherscanApiKey: string;
  chains: Record<string, ChainConfig>;
  defaults: DefaultsConfig;
}

export type WarningSeverity = "error" | "warning" | "info";

export interface ConfigWarning {
  severity: WarningSeverity;
  field: string;
  message: string;
  chain?: string;
}

export interface ConfigResponse {
  success: true;
  config: AppConfig;
  bootstrapped: boolean;
  warnings: ConfigWarning[];
}

export interface ConfigErrorResponse {
  success: false;
  error: string;
}

export interface ConfigSaveResponse {
  success: true;
  warnings: ConfigWarning[];
}
