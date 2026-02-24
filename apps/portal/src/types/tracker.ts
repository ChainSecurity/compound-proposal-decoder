// Only import types — never import runtime values from the tracker package,
// since it uses Node.js `fs` and cannot be bundled for the browser.
import type {
  TrackingResult,
  BatchTrackingResult,
  CrossChainAction,
  CrossChainActionResult,
  CrossChainStatus,
} from "@compound-security/tracker";

export type { TrackingResult, BatchTrackingResult, CrossChainAction, CrossChainActionResult, CrossChainStatus };

// Mirrored from packages/tracker/src/types.ts — kept in sync manually so
// that client components can use these values without importing Node.js code.
export enum GovernorState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

export enum ReceiverState {
  Queued = 0,
  Expired = 1,
  Executed = 2,
}

export type TrackRequest =
  | { type: "single"; proposalId: number }
  | { type: "batch"; proposalIds: number[] };

export type TrackResponse =
  | { success: true; data: TrackingResult }
  | { success: false; error: string };

export type BatchTrackResponse =
  | { success: true; data: BatchTrackingResult }
  | { success: false; error: string };
