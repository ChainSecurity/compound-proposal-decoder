/**
 * Structured logging utilities for the simulator
 *
 * Provides consistent, professional output with visual hierarchy.
 */

function formatNumber(n: number | bigint): string {
    return n.toLocaleString();
}

function formatTx(hash: string): string {
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export const log = {
    /**
     * Print a section header
     * @example log.section("Governance Simulation");
     * // Output: ═══ GOVERNANCE SIMULATION ════════════════════════
     */
    section(title: string) {
        const line = "═".repeat(Math.max(0, 50 - title.length - 4));
        console.log(`\n═══ ${title.toUpperCase()} ${line}`);
    },

    /**
     * Print a chain-prefixed message
     * @example log.chain("mainnet", "Advancing to block 12345...");
     * // Output: [mainnet] Advancing to block 12345...
     */
    chain(chain: string, msg: string) {
        console.log(`[${chain}] ${msg}`);
    },

    /**
     * Print a progress step with arrow indicator
     * @example log.step("Casting vote for proposal");
     * // Output:   → Casting vote for proposal
     */
    step(msg: string) {
        console.log(`  → ${msg}`);
    },

    /**
     * Print a completed action with checkmark
     * @example log.done("Vote cast successfully");
     * // Output:   ✓ Vote cast successfully
     */
    done(msg: string) {
        console.log(`  ✓ ${msg}`);
    },

    /**
     * Print a key-value info line (indented)
     * @example log.info("Block", 21456789);
     * // Output:     Block: 21,456,789
     */
    info(label: string, value: string | number | bigint) {
        const formatted =
            typeof value === "number" || typeof value === "bigint"
                ? formatNumber(value)
                : value;
        console.log(`    ${label}: ${formatted}`);
    },

    /**
     * Print a transaction output with truncated hash
     * @example log.tx("Execute proposal", "0xabc123...def456");
     * // Output:     Execute proposal tx: 0xabc123...def456
     */
    tx(label: string, hash: string) {
        console.log(`    ${label} tx: ${formatTx(hash)}`);
    },

    /**
     * Print a warning message
     * @example log.warn("Gas consumption is high");
     * // Output:   ⚠ Gas consumption is high
     */
    warn(msg: string) {
        console.warn(`  ⚠ ${msg}`);
    },

    /**
     * Print an error message
     * @example log.error("Transaction reverted");
     * // Output:   ✗ Transaction reverted
     */
    error(msg: string) {
        console.error(`  ✗ ${msg}`);
    },

    /**
     * Print a plain message (for mode indicators, etc.)
     */
    plain(msg: string) {
        console.log(msg);
    },
};
