/**
 * E2E tests for the simulator package (Tenderly backend)
 *
 * These tests validate the simulator against known proposals to ensure
 * simulations produce expected results. Tests focus on success/failure
 * outcomes and structural validation.
 *
 * Test Proposals:
 * - 528: Normal baseline proposal (should succeed)
 *
 * Note: These tests require Tenderly virtual testnet access.
 * Set SKIP_TENDERLY_TESTS=true to skip these tests.
 */

import { describe, it, expect } from "vitest";
import { simulateProposal, serializeSimulationResult } from "../../src/simulator.js";
import type { SimulationResult, ChainExecutionResult } from "../../src/types.js";

// Skip tests if Tenderly RPC is not configured
const skipIfNoTenderly = process.env.SKIP_TENDERLY_TESTS === "true";

// Helper to get mainnet result
function getMainnetResult(
  chainResults: ChainExecutionResult[]
): ChainExecutionResult | undefined {
  return chainResults.find((r) => r.chainId === 1 || r.chain === "mainnet");
}

describe("Simulator E2E (Tenderly Backend)", () => {
  describe("Proposal 528 - Normal baseline", () => {
    it.skipIf(skipIfNoTenderly)(
      "simulates proposal 528 and validates full result structure",
      async () => {
        const result = await simulateProposal({
          proposalId: "528",
          mode: "direct",
          backend: "tenderly",
        });

        // Basic structure
        expect(result).toBeDefined();
        expect(result.proposalId).toBe("528");
        expect(result.mode).toBe("direct");

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

  describe("Simulation result structure validation", () => {
    it.skipIf(skipIfNoTenderly)(
      "simulation results have consistent structure",
      async () => {
        const result = await simulateProposal({
          proposalId: "528",
          mode: "direct",
          backend: "tenderly",
        });

        // Top-level structure
        expect(result).toMatchObject({
          proposalId: expect.any(String),
          success: expect.any(Boolean),
          mode: expect.stringMatching(/^(governance|direct|direct-persist)$/),
          chainResults: expect.any(Array),
          startedAt: expect.any(String),
          completedAt: expect.any(String),
          durationMs: expect.any(Number),
        });

        // Chain result structure
        for (const chainResult of result.chainResults) {
          expect(chainResult).toMatchObject({
            chain: expect.any(String),
            chainId: expect.any(Number),
            success: expect.any(Boolean),
            timelockAddress: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
            executions: expect.any(Array),
            persisted: expect.any(Boolean),
          });

          // Execution structure
          for (const execution of chainResult.executions) {
            expect(execution).toMatchObject({
              index: expect.any(Number),
              target: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
              value: expect.any(BigInt),
              calldata: expect.stringMatching(/^0x/),
              success: expect.any(Boolean),
            });
          }
        }

        // Duration should be positive
        expect(result.durationMs).toBeGreaterThan(0);

        // Timestamps should be valid ISO strings
        expect(new Date(result.startedAt).getTime()).not.toBeNaN();
        expect(new Date(result.completedAt).getTime()).not.toBeNaN();
      },
      300000
    );
  });

  describe("Serialization", () => {
    it.skipIf(skipIfNoTenderly)(
      "serialized result can be round-tripped through JSON",
      async () => {
        const result = await simulateProposal({
          proposalId: "528",
          mode: "direct",
          backend: "tenderly",
        });

        const serialized = serializeSimulationResult(result);

        // Verify serialized values are strings (bigints converted)
        expect(typeof serialized.durationMs).toBe("number");

        for (const chainResult of serialized.chainResults) {
          for (const execution of chainResult.executions) {
            expect(typeof execution.value).toBe("string");
            if (execution.gasUsed) {
              expect(typeof execution.gasUsed).toBe("string");
            }
          }

          if (chainResult.totalGasUsed) {
            expect(typeof chainResult.totalGasUsed).toBe("string");
          }
        }

        // Round-trip through JSON
        const json = JSON.stringify(serialized);
        const parsed = JSON.parse(json);
        expect(parsed).toEqual(serialized);
      },
      300000
    );
  });
});
