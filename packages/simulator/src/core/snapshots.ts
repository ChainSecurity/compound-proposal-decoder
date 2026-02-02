/**
 * Snapshot management functions
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config";
import type { Backend } from "../backends";
import type { Logger } from "./types";

const config = loadConfig();

// Compute monorepo root for snapshot storage (shared between CLI and portal)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..", "..");
const MONOREPO_ROOT = join(PACKAGE_ROOT, "..", "..");

/**
 * Directory for snapshot files, at monorepo root (shared between CLI and portal)
 */
export const SNAPSHOTS_DIR = join(MONOREPO_ROOT, ".snapshots");

/**
 * Get the path to a chain's snapshot file
 */
export function getSnapshotPath(chain: string): string {
    return join(SNAPSHOTS_DIR, `${chain}.json`);
}

/**
 * Get the RPC URL for a chain from config
 */
export function getRpcUrl(chain: string): string {
    return config.chains[chain]?.rpcUrl ?? "";
}

/**
 * Read the snapshot file for a chain
 * Returns a map from RPC URL to array of snapshot IDs
 */
export function readSnapshotFile(chain: string): Record<string, string[]> {
    const path = getSnapshotPath(chain);
    if (!existsSync(path)) return {};
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
        return {};
    }
}

/**
 * Write snapshot data to a chain's snapshot file
 */
export function writeSnapshotFile(chain: string, data: Record<string, string[]>): void {
    if (!existsSync(SNAPSHOTS_DIR)) {
        mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    writeFileSync(getSnapshotPath(chain), JSON.stringify(data, null, 2) + "\n");
}

/**
 * Get all snapshot IDs for a chain (from current RPC URL)
 */
export function getSnapshots(chain: string): string[] {
    const rpcUrl = getRpcUrl(chain);
    if (!rpcUrl) return [];
    const data = readSnapshotFile(chain);
    return data[rpcUrl] ?? [];
}

/**
 * Resolve a snapshot reference to an actual snapshot ID
 *
 * @param chain - The chain name
 * @param ref - Snapshot reference: "latest", negative index (-1, -2), or full hash
 * @returns The resolved snapshot ID or null if not found
 */
export function resolveSnapshotId(chain: string, ref?: string): string | null {
    const snapshots = getSnapshots(chain);
    if (!ref || ref === "latest") {
        return snapshots.length > 0 ? snapshots[snapshots.length - 1] ?? null : null;
    }
    // Negative index: -1 = latest, -2 = second to last
    if (ref.startsWith("-")) {
        const idx = parseInt(ref, 10);
        const pos = snapshots.length + idx;
        return pos >= 0 && pos < snapshots.length ? snapshots[pos] ?? null : null;
    }
    // Full hash
    if (ref.startsWith("0x")) {
        return snapshots.includes(ref) ? ref : null;
    }
    return null;
}

/**
 * Create a snapshot and optionally store it in the snapshot file
 *
 * @param chain - The chain name
 * @param backend - The backend to use
 * @param logger - Logger for output (optional, uses nullLogger if not provided)
 * @returns The snapshot ID
 */
export async function createSnapshot(
    chain: string,
    backend: Backend,
    logger?: Logger
): Promise<string> {
    const snapshotId = await backend.snapshot(chain);

    // Only store snapshots for backends that support persistence
    if (backend.supportsPersistentSnapshots()) {
        const rpcUrl = getRpcUrl(chain);
        const data = readSnapshotFile(chain);
        if (!data[rpcUrl]) {
            data[rpcUrl] = [];
        }
        data[rpcUrl]!.push(snapshotId);
        writeSnapshotFile(chain, data);
    }

    if (logger) {
        logger.info(`Snapshot ${chain}`, snapshotId);
    }

    return snapshotId;
}

/**
 * Store a snapshot ID in the snapshot file
 * Used when a snapshot is created outside of createSnapshot()
 */
export function storeSnapshotId(chain: string, snapshotId: string): void {
    const rpcUrl = getRpcUrl(chain);
    const data = readSnapshotFile(chain);
    if (!data[rpcUrl]) {
        data[rpcUrl] = [];
    }
    data[rpcUrl]!.push(snapshotId);
    writeSnapshotFile(chain, data);
}
