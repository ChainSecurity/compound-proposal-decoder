import { NextRequest, NextResponse } from "next/server";
import {
  revertChain,
  revertChains,
  revertAllChains,
} from "@compound-security/simulator";
import type { RevertRequest, RevertResponse, RevertResultItem } from "@/types/simulator";

export async function POST(request: NextRequest): Promise<NextResponse<RevertResponse>> {
  try {
    const body = (await request.json()) as RevertRequest;

    let results: RevertResultItem[];

    switch (body.type) {
      case "single": {
        if (!body.chain || typeof body.chain !== "string") {
          return NextResponse.json(
            { success: false, error: "chain is required and must be a string" },
            { status: 400 }
          );
        }
        const result = await revertChain(body.chain, body.snapshot);
        results = [result];
        break;
      }

      case "multiple": {
        if (!Array.isArray(body.chains) || body.chains.length === 0) {
          return NextResponse.json(
            { success: false, error: "chains must be a non-empty array" },
            { status: 400 }
          );
        }
        results = await revertChains(body.chains, body.snapshot);
        break;
      }

      case "all": {
        results = await revertAllChains(body.snapshot);
        break;
      }

      default: {
        return NextResponse.json(
          { success: false, error: "Invalid request type. Use 'single', 'multiple', or 'all'" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
    } as RevertResponse);
  } catch (error) {
    console.error("Revert error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to revert chain(s)";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
