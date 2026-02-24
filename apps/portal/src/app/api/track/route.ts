import { NextRequest, NextResponse } from "next/server";
import { trackProposal, trackProposals } from "@compound-security/tracker";
import type { TrackRequest, TrackResponse, BatchTrackResponse } from "@/types/tracker";

export async function POST(
  request: NextRequest
): Promise<NextResponse<TrackResponse | BatchTrackResponse>> {
  try {
    const body = (await request.json()) as TrackRequest;

    if (body.type === "single") {
      if (typeof body.proposalId !== "number" || body.proposalId < 0) {
        return NextResponse.json(
          { success: false, error: "proposalId must be a non-negative number" },
          { status: 400 }
        );
      }
      const result = await trackProposal(body.proposalId);
      return NextResponse.json({ success: true, data: result });
    }

    if (body.type === "batch") {
      if (!Array.isArray(body.proposalIds) || body.proposalIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "proposalIds must be a non-empty array" },
          { status: 400 }
        );
      }
      if (body.proposalIds.length > 200) {
        return NextResponse.json(
          { success: false, error: "Cannot track more than 200 proposals at once" },
          { status: 400 }
        );
      }
      if (!body.proposalIds.every((id) => typeof id === "number" && id >= 0)) {
        return NextResponse.json(
          { success: false, error: "All proposal IDs must be non-negative numbers" },
          { status: 400 }
        );
      }
      const result = await trackProposals(body.proposalIds);
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json(
      { success: false, error: "Invalid request type. Use 'single' or 'batch'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Track error:", error);
    const message = error instanceof Error ? error.message : "Failed to track proposal";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
