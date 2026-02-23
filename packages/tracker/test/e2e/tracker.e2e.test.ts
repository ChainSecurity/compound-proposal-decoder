import { describe, it, expect } from "vitest";
import { trackProposal, trackProposals, GovernorState } from "@/tracker";

describe("trackProposal (e2e)", () => {
  it("tracks a proposal with no cross-chain actions (519)", async () => {
    const result = await trackProposal(519);

    expect(result.proposalId).toBe(519);
    expect(result.governorState).toBeDefined();
    expect(result.hasCrossChainActions).toBe(false);
    expect(result.actions).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("tracks an executed cross-chain proposal with L2 status (528)", async () => {
    const result = await trackProposal(528);

    expect(result.proposalId).toBe(528);
    expect(result.governorState).toBe(GovernorState.Executed);
    expect(result.hasCrossChainActions).toBe(true);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);

    // Each action should have valid structure
    for (const actionResult of result.actions) {
      expect(actionResult.action.chainName).toBeTruthy();
      expect(actionResult.action.bridgeType).toBeTruthy();
      expect(actionResult.action.innerTargets.length).toBeGreaterThan(0);
      expect(["not-transmitted", "pending", "executed", "expired"]).toContain(actionResult.status);
    }

    // 528 is known to have executed on Base
    const baseAction = result.actions.find((a) => a.action.chainName === "base");
    expect(baseAction).toBeDefined();
    expect(baseAction!.status).toBe("executed");
    expect(baseAction!.l2ProposalId).toBeDefined();
  });

  it("returns valid governor state enum values", async () => {
    const result = await trackProposal(528);
    expect(result.governorState).toBeGreaterThanOrEqual(0);
    expect(result.governorState).toBeLessThanOrEqual(7);
  });
});

describe("trackProposals (e2e)", () => {
  it("tracks a batch of proposals (519, 528)", async () => {
    const batch = await trackProposals([519, 528]);

    expect(batch.results).toHaveLength(2);
    expect(batch.totalDurationMs).toBeGreaterThan(0);

    // First result: 519 (no cross-chain)
    expect(batch.results[0]!.proposalId).toBe(519);
    expect(batch.results[0]!.hasCrossChainActions).toBe(false);

    // Second result: 528 (cross-chain, executed)
    expect(batch.results[1]!.proposalId).toBe(528);
    expect(batch.results[1]!.hasCrossChainActions).toBe(true);
    expect(batch.results[1]!.governorState).toBe(GovernorState.Executed);
  });
});
