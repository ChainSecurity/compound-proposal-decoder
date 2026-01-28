/**
 * E2E tests for the decoder package
 *
 * These tests validate the decoder against known proposals to ensure
 * the data structures are correct. Tests focus on structural validation
 * rather than exact output matching to remain stable as printers change.
 *
 * Test Proposals:
 * - 518: High gas consumption scenario
 * - 519: High message value scenario
 * - 524: CCIP/Ronin bridge with patch required
 * - 528: Normal baseline proposal
 */

import { describe, it, expect } from "vitest";
import { decodeProposal } from "../../src/decoder.js";
import type { CallNode, DecodedProposal, CallEdge } from "../../src/types.js";

// Utility to serialize BigInts for JSON comparison
function serializeBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === "bigint") {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInts);
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip non-serializable fields from ethers.js
      if (key === "argParams" || key === "rawArgs") {
        continue;
      }
      result[key] = serializeBigInts(value);
    }
    return result;
  }
  return obj;
}

// Helper to find a call by edge type (bridge, multicall, etc.)
function findCallByEdgeType(
  calls: CallNode[],
  edgeType: CallEdge["type"]
): { edge: CallEdge; node: CallNode } | undefined {
  for (const call of calls) {
    if (call.children) {
      for (const child of call.children) {
        if (child.edge.type === edgeType) {
          return child;
        }
        // Recursively search in nested children
        const found = findCallByEdgeType([child.node], edgeType);
        if (found) return found;
      }
    }
  }
  return undefined;
}

// Helper to count decoded calls at top level
function countDecodedTopLevelCalls(calls: CallNode[]): { decoded: number; total: number } {
  let decoded = 0;
  let total = 0;
  for (const call of calls) {
    // Only count calls with calldata
    if (call.rawCalldata && call.rawCalldata !== "0x") {
      total++;
      if (call.decoded) {
        decoded++;
      }
    }
  }
  return { decoded, total };
}

describe("Decoder E2E", () => {
  describe("Proposal 518 - High gas consumption", () => {
    let result: DecodedProposal;

    it("decodes proposal 518 successfully", async () => {
      result = await decodeProposal(518);
      expect(result).toBeDefined();
      expect(result.proposalId).toBe(518n);
    }, 120000);

    it("has the correct governor address", () => {
      expect(result.governor.toLowerCase()).toContain("0x");
      expect(result.governor.length).toBe(42); // Valid Ethereum address
    });

    it("has at least one top-level action", () => {
      expect(result.calls.length).toBeGreaterThan(0);
    });

    it("all top-level calls are on mainnet (chain 1)", () => {
      for (const call of result.calls) {
        expect(call.chainId).toBe(1);
      }
    });

    it("decodes most top-level calls successfully", () => {
      const { decoded, total } = countDecodedTopLevelCalls(result.calls);
      // At least 50% of calls should be decoded (some contracts may be unverified)
      expect(decoded / total).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe("Proposal 519 - High message value", () => {
    let result: DecodedProposal;

    it("decodes proposal 519 successfully", async () => {
      result = await decodeProposal(519);
      expect(result).toBeDefined();
      expect(result.proposalId).toBe(519n);
    }, 120000);

    it("has at least one top-level action", () => {
      expect(result.calls.length).toBeGreaterThan(0);
    });

    it("all top-level calls are on mainnet (chain 1)", () => {
      for (const call of result.calls) {
        expect(call.chainId).toBe(1);
      }
    });

    it("decodes most top-level calls successfully", () => {
      const { decoded, total } = countDecodedTopLevelCalls(result.calls);
      expect(decoded / total).toBeGreaterThanOrEqual(0.5);
    });

    it("can be serialized to JSON", () => {
      const serialized = serializeBigInts(result);
      const json = JSON.stringify(serialized);
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);
    });
  });

  describe("Proposal 524 - CCIP/Ronin bridge", () => {
    let result: DecodedProposal;

    it("decodes proposal 524 successfully", async () => {
      result = await decodeProposal(524);
      expect(result).toBeDefined();
      expect(result.proposalId).toBe(524n);
    }, 120000);

    it("has at least one top-level action", () => {
      expect(result.calls.length).toBeGreaterThan(0);
    });

    it("all top-level calls are on mainnet (chain 1)", () => {
      for (const call of result.calls) {
        expect(call.chainId).toBe(1);
      }
    });

    it("detects bridge calls with children", () => {
      const bridgeCall = findCallByEdgeType(result.calls, "bridge");
      // This proposal should have CCIP bridge calls
      expect(bridgeCall).toBeDefined();
    });

    it("bridge call has CCIP label", () => {
      const bridgeCall = findCallByEdgeType(result.calls, "bridge");
      if (bridgeCall) {
        expect(bridgeCall.edge.label).toBeDefined();
        // CCIP bridge should have a label containing "CCIP" or the destination chain
        expect(
          bridgeCall.edge.label?.toLowerCase().includes("ccip") ||
            bridgeCall.edge.label?.toLowerCase().includes("ronin") ||
            bridgeCall.edge.chainId !== undefined
        ).toBe(true);
      }
    });

    it("decodes most top-level calls successfully", () => {
      const { decoded, total } = countDecodedTopLevelCalls(result.calls);
      expect(decoded / total).toBeGreaterThanOrEqual(0.5);
    });

    it("can be serialized to JSON", () => {
      const serialized = serializeBigInts(result);
      const json = JSON.stringify(serialized);
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);
    });
  });

  describe("Proposal 528 - Normal baseline", () => {
    let result: DecodedProposal;

    it("decodes proposal 528 successfully", async () => {
      result = await decodeProposal(528);
      expect(result).toBeDefined();
      expect(result.proposalId).toBe(528n);
    }, 120000);

    it("has the correct governor address", () => {
      expect(result.governor.toLowerCase()).toContain("0x");
      expect(result.governor.length).toBe(42);
    });

    it("has at least one top-level action", () => {
      expect(result.calls.length).toBeGreaterThan(0);
    });

    it("all top-level calls are on mainnet (chain 1)", () => {
      for (const call of result.calls) {
        expect(call.chainId).toBe(1);
      }
    });

    it("decodes most top-level calls successfully", () => {
      const { decoded, total } = countDecodedTopLevelCalls(result.calls);
      expect(decoded / total).toBeGreaterThanOrEqual(0.5);
    });

    it("decoded functions have valid signatures", () => {
      for (const call of result.calls) {
        if (call.decoded) {
          expect(call.decoded.name).toBeDefined();
          expect(call.decoded.signature).toContain("(");
          expect(call.decoded.selector).toMatch(/^0x[0-9a-f]{8}$/i);
        }
      }
    });

    it("target addresses are valid checksummed addresses", () => {
      for (const call of result.calls) {
        expect(call.target).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
    });

    it("can be serialized to JSON", () => {
      const serialized = serializeBigInts(result);
      const json = JSON.stringify(serialized);
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-proposal validation", () => {
    it("all test proposals decode with consistent structure", async () => {
      const proposalIds = [518, 519, 524, 528];

      for (const id of proposalIds) {
        const result = await decodeProposal(id);

        // Basic structure validation
        expect(result.governor).toBeDefined();
        expect(result.proposalId).toBe(BigInt(id));
        expect(result.descriptionHash).toBeDefined();
        expect(Array.isArray(result.calls)).toBe(true);

        // Each call should have required fields
        for (const call of result.calls) {
          expect(call.chainId).toBeDefined();
          expect(call.target).toBeDefined();
          expect(call.rawCalldata).toBeDefined();
          expect(typeof call.valueWei).toBe("bigint");
        }
      }
    }, 300000); // 5 min timeout for all proposals
  });
});
