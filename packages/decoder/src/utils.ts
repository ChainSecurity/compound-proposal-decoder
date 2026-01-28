import { existsSync, mkdirSync } from "fs";
import { getAddress } from "ethers";

export function checksum(addr: string): string {
  return getAddress(addr);
}

export function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export function toReadableArg(arg: unknown): unknown {
  if (typeof arg === "bigint") return arg;
  if (Array.isArray(arg)) return arg.map(toReadableArg);
  if (typeof arg === "object" && arg !== null) {
    const newObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(arg)) {
      newObj[k] = toReadableArg(v);
    }
    return newObj;
  }
  return arg;
}
