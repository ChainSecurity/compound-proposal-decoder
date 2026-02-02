/**
 * Recursively serialize an object, converting BigInt values to strings
 * and skipping non-serializable fields like argParams and rawArgs.
 */
export function serializeBigInts(obj: unknown): unknown {
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
