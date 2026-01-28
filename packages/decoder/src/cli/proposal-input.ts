import { readFile } from "node:fs/promises";
import { isHexString } from "ethers";
import type { ProposalDetails } from "../types.js";
import type { ProposalMetadata } from "../decoder.js";

export type ParsedProposalInput =
  | { kind: "id"; id: number }
  | { kind: "details"; details: ProposalDetails; metadata: ProposalMetadata }
  | { kind: "calldata"; calldata: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Proposal JSON must include an array for \"${field}\"`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`Expected ${field}[${index}] to be a string`);
    }
    return item;
  });
}

function parseBigIntValue(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      throw new Error(`Unable to parse ${field} value \"${value}\" as bigint`);
    }
  }

  throw new Error(`${field} must be provided as a bigint, integer, or numeric string`);
}

function parseBigIntArray(value: unknown, field: string): bigint[] {
  if (!Array.isArray(value)) {
    throw new Error(`Proposal JSON must include an array for \"${field}\"`);
  }

  return value.map((item, index) => parseBigIntValue(item, `${field}[${index}]`));
}

function parseChainId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  throw new Error("metadata.chainId must be an integer value");
}

async function loadProposalJson(raw: string): Promise<unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse proposal JSON from inline input: ${message}`);
    }
  }

  try {
    const fileContents = await readFile(raw, "utf8");
    try {
      return JSON.parse(fileContents);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse proposal JSON from file \"${raw}\": ${message}`);
    }
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      throw new Error(`Proposal argument \"${raw}\" is neither a numeric ID nor a readable JSON file`);
    }
    throw err;
  }
}

function parseProposalJson(value: unknown): {
  details: ProposalDetails;
  metadata: ProposalMetadata;
} {
  if (!isRecord(value)) {
    throw new Error("Proposal JSON must be an object");
  }

  const root = value;
  const detailsSource = "details" in root && isRecord(root.details) ? root.details : root;
  if (!isRecord(detailsSource)) {
    throw new Error("Proposal JSON must provide proposal details under a 'details' object or at the top level");
  }

  const targets = parseStringArray(detailsSource.targets, "targets");
  const calldatas = parseStringArray(detailsSource.calldatas, "calldatas");
  const values = parseBigIntArray(detailsSource.values, "values");
  const descriptionHash = detailsSource.descriptionHash;

  if (typeof descriptionHash !== "string" || !descriptionHash.trim()) {
    throw new Error("details.descriptionHash must be a non-empty string");
  }

  if (!(targets.length === calldatas.length && calldatas.length === values.length)) {
    throw new Error("Proposal details arrays (targets, calldatas, values) must have equal length");
  }

  const metadata: ProposalMetadata = {};
  const metadataSource = "metadata" in root && isRecord(root.metadata) ? root.metadata : root;

  if ("governor" in metadataSource && metadataSource.governor !== undefined) {
    if (typeof metadataSource.governor !== "string") {
      throw new Error("metadata.governor must be a string");
    }
    metadata.governor = metadataSource.governor;
  }

  if ("proposalId" in metadataSource && metadataSource.proposalId !== undefined) {
    metadata.proposalId = parseBigIntValue(metadataSource.proposalId, "metadata.proposalId");
  }

  if ("chainId" in metadataSource && metadataSource.chainId !== undefined) {
    metadata.chainId = parseChainId(metadataSource.chainId);
  }

  return {
    details: {
      targets,
      values,
      calldatas,
      descriptionHash,
    },
    metadata,
  };
}

export async function parseProposalInput(raw: string): Promise<ParsedProposalInput> {
  const proposalArg = raw.trim();
  if (!proposalArg) {
    throw new Error("Proposal argument cannot be empty");
  }

  if (/^\d+$/.test(proposalArg)) {
    const id = Number(proposalArg);
    if (!Number.isSafeInteger(id)) {
      throw new Error("Proposal id must be a safe integer");
    }
    return { kind: "id", id };
  }

  if (isHexString(proposalArg)) {
    if (proposalArg.length < 10 || (proposalArg.length - 2) % 2 !== 0) {
      throw new Error("Proposal calldata must be valid hex with an even number of characters");
    }
    return { kind: "calldata", calldata: proposalArg };
  }

  const json = await loadProposalJson(raw);
  const { details, metadata } = parseProposalJson(json);
  return { kind: "details", details, metadata };
}
