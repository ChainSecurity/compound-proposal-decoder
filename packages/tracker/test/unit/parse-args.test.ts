import { describe, it, expect } from "vitest";
import { parseProposalArgs } from "@/parse-args";

describe("parseProposalArgs", () => {
  it("parses a single ID", () => {
    expect(parseProposalArgs(["528"])).toEqual([528]);
  });

  it("parses multiple IDs", () => {
    expect(parseProposalArgs(["519", "528", "540"])).toEqual([519, 528, 540]);
  });

  it("parses a range", () => {
    expect(parseProposalArgs(["525-530"])).toEqual([525, 526, 527, 528, 529, 530]);
  });

  it("parses a single-element range", () => {
    expect(parseProposalArgs(["528-528"])).toEqual([528]);
  });

  it("parses mixed IDs and ranges", () => {
    expect(parseProposalArgs(["519", "525-528", "540"])).toEqual([
      519, 525, 526, 527, 528, 540,
    ]);
  });

  it("deduplicates overlapping IDs", () => {
    expect(parseProposalArgs(["528", "527-529"])).toEqual([527, 528, 529]);
  });

  it("sorts results in ascending order", () => {
    expect(parseProposalArgs(["540", "519", "528"])).toEqual([519, 528, 540]);
  });

  it("throws on non-numeric input", () => {
    expect(() => parseProposalArgs(["abc"])).toThrow('Invalid proposal argument "abc"');
  });

  it("throws on reversed range", () => {
    expect(() => parseProposalArgs(["5-3"])).toThrow('Invalid range "5-3"');
  });

  it("throws on negative-looking input", () => {
    expect(() => parseProposalArgs(["-1"])).toThrow('Invalid proposal argument "-1"');
  });

  it("throws on empty input", () => {
    expect(() => parseProposalArgs([])).toThrow("No proposal IDs provided");
  });
});
