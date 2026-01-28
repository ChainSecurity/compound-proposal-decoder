#!/usr/bin/env tsx
/**
 * Generate test fixtures for decoder e2e tests
 *
 * This script decodes test proposals and saves them as expected JSON fixtures.
 * Run with: pnpm --filter @compound-security/decoder generate-fixtures
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "test", "fixtures");

// Test proposals
const TEST_PROPOSALS = [518, 519, 524, 528];

// Serialization function (mirrors portal serialization)
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

async function main() {
  // Ensure fixtures directory exists
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Import decoder dynamically to get fresh instance
  const { decodeProposal } = await import("../src/decoder.js");

  console.log("Generating fixtures for proposals:", TEST_PROPOSALS);

  for (const proposalId of TEST_PROPOSALS) {
    try {
      console.log(`\nDecoding proposal ${proposalId}...`);
      const result = await decodeProposal(proposalId);

      const serialized = serializeBigInts(result);
      const json = JSON.stringify(serialized, null, 2);

      const outputPath = join(FIXTURES_DIR, `proposal-${proposalId}.expected.json`);
      writeFileSync(outputPath, json + "\n");

      console.log(`  Saved to ${outputPath}`);
      console.log(`  - ${result.calls.length} top-level actions`);
    } catch (error) {
      console.error(`  Failed to decode proposal ${proposalId}:`, error);
    }
  }

  console.log("\nFixture generation complete.");
}

main().catch(console.error);
