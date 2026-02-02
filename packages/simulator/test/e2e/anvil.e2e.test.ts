/**
 * E2E tests for the Anvil backend
 *
 * These tests validate the Anvil backend against known proposals to ensure
 * simulations produce expected results using local Foundry Anvil processes.
 *
 * Test Proposals:
 * - 528: Normal baseline proposal (should succeed)
 *
 * Note: These tests require Foundry to be installed (anvil command available).
 * Set SKIP_ANVIL_TESTS=true to skip these tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { simulateProposal, serializeSimulationResult } from "../../src/simulator.js";
import type { ChainExecutionResult } from "../../src/types.js";

// Skip tests if Anvil is not available or explicitly skipped
const skipIfNoAnvil = process.env.SKIP_ANVIL_TESTS === "true";

// Check if Anvil is installed
async function isAnvilAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const process = spawn("which", ["anvil"]);
    process.on("close", (code) => resolve(code === 0));
    process.on("error", () => resolve(false));
  });
}

// Helper to get mainnet result
function getMainnetResult(
  chainResults: ChainExecutionResult[]
): ChainExecutionResult | undefined {
  return chainResults.find((r) => r.chainId === 1 || r.chain === "mainnet");
}

describe("Anvil Backend E2E", () => {
  let anvilAvailable = false;

  beforeAll(async () => {
    anvilAvailable = await isAnvilAvailable();
    if (!anvilAvailable && !skipIfNoAnvil) {
      console.warn("Anvil not found in PATH. Install Foundry to run these tests.");
    }
  });

  const shouldSkip = () => skipIfNoAnvil || !anvilAvailable;

  describe("Proposal 528 - Anvil backend simulation", () => {
    it.skipIf(shouldSkip())(
      "simulates proposal 528 with Anvil backend in direct mode",
      async () => {
        const result = await simulateProposal({
          proposalId: "528",
          mode: "direct",
          backend: "anvil",
        });

        // Basic structure
        expect(result).toBeDefined();
        expect(result.proposalId).toBe("528");
        expect(result.mode).toBe("direct");
        expect(result.backend).toBe("anvil");

        // Success validation
        expect(result.success).toBe(true);
        expect(result.chainResults.length).toBeGreaterThan(0);

        // All chain results succeed
        for (const chainResult of result.chainResults) {
          expect(chainResult.success).toBe(true);
        }

        // All executions succeed
        for (const chainResult of result.chainResults) {
          expect(chainResult.executions.length).toBeGreaterThan(0);
          for (const execution of chainResult.executions) {
            expect(execution.success).toBe(true);
            expect(execution.revertReason).toBeUndefined();
          }
        }

        // Reports gas usage
        const mainnet = getMainnetResult(result.chainResults);
        expect(mainnet).toBeDefined();
        const hasGasData = mainnet!.executions.some((e) => e.gasUsed !== undefined);
        expect(hasGasData).toBe(true);

        // Can be serialized to JSON
        const serialized = serializeSimulationResult(result);
        const json = JSON.stringify(serialized);
        expect(json).toBeDefined();
        expect(json.length).toBeGreaterThan(0);
      },
      300000
    );
  });

  describe("Anvil backend properties", () => {
    it.skipIf(shouldSkip())(
      "Anvil backend does not support persistent snapshots",
      async () => {
        // Import the backend directly to test its properties
        const { createBackend } = await import("../../src/backends/index.js");
        const backend = createBackend("anvil");

        expect(backend.name).toBe("anvil");
        expect(backend.supportsPersistentSnapshots()).toBe(false);
      }
    );

    it.skipIf(shouldSkip())(
      "simulation result indicates anvil backend was used",
      async () => {
        const result = await simulateProposal({
          proposalId: "528",
          mode: "direct",
          backend: "anvil",
        });

        expect(result.backend).toBe("anvil");
      },
      300000
    );
  });

  describe("Backend comparison", () => {
    it.skipIf(shouldSkip())(
      "Anvil and Tenderly backends have consistent interfaces",
      async () => {
        const { createBackend } = await import("../../src/backends/index.js");

        const anvilBackend = createBackend("anvil");
        const tenderlyBackend = createBackend("tenderly");

        // Both implement the same interface
        expect(typeof anvilBackend.initialize).toBe("function");
        expect(typeof anvilBackend.cleanup).toBe("function");
        expect(typeof anvilBackend.getProvider).toBe("function");
        expect(typeof anvilBackend.setStorageAt).toBe("function");
        expect(typeof anvilBackend.mineBlock).toBe("function");
        expect(typeof anvilBackend.advanceTime).toBe("function");
        expect(typeof anvilBackend.impersonateAccount).toBe("function");
        expect(typeof anvilBackend.stopImpersonating).toBe("function");
        expect(typeof anvilBackend.simulateBundle).toBe("function");
        expect(typeof anvilBackend.snapshot).toBe("function");
        expect(typeof anvilBackend.revert).toBe("function");
        expect(typeof anvilBackend.supportsPersistentSnapshots).toBe("function");
        expect(typeof anvilBackend.sendTransaction).toBe("function");

        expect(typeof tenderlyBackend.initialize).toBe("function");
        expect(typeof tenderlyBackend.cleanup).toBe("function");
        expect(typeof tenderlyBackend.getProvider).toBe("function");
        expect(typeof tenderlyBackend.setStorageAt).toBe("function");
        expect(typeof tenderlyBackend.mineBlock).toBe("function");
        expect(typeof tenderlyBackend.advanceTime).toBe("function");
        expect(typeof tenderlyBackend.impersonateAccount).toBe("function");
        expect(typeof tenderlyBackend.stopImpersonating).toBe("function");
        expect(typeof tenderlyBackend.simulateBundle).toBe("function");
        expect(typeof tenderlyBackend.snapshot).toBe("function");
        expect(typeof tenderlyBackend.revert).toBe("function");
        expect(typeof tenderlyBackend.supportsPersistentSnapshots).toBe("function");
        expect(typeof tenderlyBackend.sendTransaction).toBe("function");

        // Different names
        expect(anvilBackend.name).toBe("anvil");
        expect(tenderlyBackend.name).toBe("tenderly");

        // Different persistence support
        expect(anvilBackend.supportsPersistentSnapshots()).toBe(false);
        expect(tenderlyBackend.supportsPersistentSnapshots()).toBe(true);
      }
    );
  });
});
