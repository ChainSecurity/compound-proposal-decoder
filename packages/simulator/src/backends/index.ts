/**
 * Backend factory and exports
 */

export type {
    Backend,
    BackendType,
    TransactionParams,
    BundleTransactionResult,
    MineBlockOptions,
    BackendInitOptions,
} from "./types";

export { TenderlyBackend } from "./tenderly";
export { AnvilBackend } from "./anvil";

import type { Backend, BackendType } from "./types";
import { TenderlyBackend } from "./tenderly";
import { AnvilBackend } from "./anvil";

/**
 * Create a backend instance
 *
 * @param type - Backend type ("anvil" or "tenderly")
 * @returns Backend instance (not yet initialized)
 */
export function createBackend(type: BackendType): Backend {
    switch (type) {
        case "anvil":
            return new AnvilBackend();
        case "tenderly":
            return new TenderlyBackend();
        default:
            throw new Error(`Unknown backend type: ${type}`);
    }
}
