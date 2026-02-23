import { describe, it, expect } from "vitest";
import { getTxExplorerUrl } from "@/explorer";

const SAMPLE_TX = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

describe("getTxExplorerUrl", () => {
  it("returns correct URL for Ethereum mainnet", () => {
    expect(getTxExplorerUrl(1, SAMPLE_TX)).toBe(`https://etherscan.io/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Base", () => {
    expect(getTxExplorerUrl(8453, SAMPLE_TX)).toBe(`https://basescan.org/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Arbitrum", () => {
    expect(getTxExplorerUrl(42161, SAMPLE_TX)).toBe(`https://arbiscan.io/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Optimism", () => {
    expect(getTxExplorerUrl(10, SAMPLE_TX)).toBe(`https://optimistic.etherscan.io/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Polygon", () => {
    expect(getTxExplorerUrl(137, SAMPLE_TX)).toBe(`https://polygonscan.com/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Scroll", () => {
    expect(getTxExplorerUrl(534352, SAMPLE_TX)).toBe(`https://scrollscan.com/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Linea", () => {
    expect(getTxExplorerUrl(59144, SAMPLE_TX)).toBe(`https://lineascan.build/tx/${SAMPLE_TX}`);
  });

  it("returns correct URL for Ronin", () => {
    expect(getTxExplorerUrl(2020, SAMPLE_TX)).toBe(`https://app.roninchain.com/tx/${SAMPLE_TX}`);
  });

  it("returns undefined for unknown chain ID", () => {
    expect(getTxExplorerUrl(99999, SAMPLE_TX)).toBeUndefined();
  });
});
