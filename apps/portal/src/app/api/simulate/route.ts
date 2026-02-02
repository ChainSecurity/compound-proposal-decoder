import { NextRequest, NextResponse } from "next/server";
import {
  simulateProposal,
  simulateProposalFromCalldata,
  simulateProposalFromDetails,
  serializeSimulationResult,
} from "@compound-security/simulator";
import type { SimulateRequest, SimulateResponse, SimulationMode, BackendType } from "@/types/simulator";

// Extended timeout for simulations (5 minutes)
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse<SimulateResponse>> {
  try {
    const body = (await request.json()) as SimulateRequest;

    let result;
    const mode: SimulationMode = body.mode ?? "governance";
    const backend: BackendType = body.backend ?? "tenderly";

    switch (body.type) {
      case "id": {
        if (typeof body.proposalId !== "number" || body.proposalId < 0) {
          return NextResponse.json(
            { success: false, error: "proposalId must be a non-negative number" },
            { status: 400 }
          );
        }
        result = await simulateProposal({
          proposalId: String(body.proposalId),
          mode,
          backend,
        });
        break;
      }

      case "calldata": {
        if (!body.calldata || typeof body.calldata !== "string") {
          return NextResponse.json(
            { success: false, error: "calldata is required and must be a string" },
            { status: 400 }
          );
        }
        if (!body.calldata.startsWith("0x")) {
          return NextResponse.json(
            { success: false, error: "calldata must be a hex string starting with 0x" },
            { status: 400 }
          );
        }
        result = await simulateProposalFromCalldata(body.calldata, { mode, backend });
        break;
      }

      case "details": {
        if (!body.details) {
          return NextResponse.json(
            { success: false, error: "details object is required" },
            { status: 400 }
          );
        }

        const { targets, values, calldatas, descriptionHash } = body.details;

        if (!Array.isArray(targets) || !Array.isArray(values) || !Array.isArray(calldatas)) {
          return NextResponse.json(
            { success: false, error: "details must include targets, values, and calldatas arrays" },
            { status: 400 }
          );
        }

        if (targets.length !== values.length || values.length !== calldatas.length) {
          return NextResponse.json(
            { success: false, error: "targets, values, and calldatas must have equal length" },
            { status: 400 }
          );
        }

        // Convert string values to bigint
        const proposalDetails = {
          targets,
          values: values.map((v) => BigInt(v)),
          calldatas,
          descriptionHash: descriptionHash ?? "0x",
        };

        result = await simulateProposalFromDetails(proposalDetails, { mode, backend });
        break;
      }

      default: {
        return NextResponse.json(
          { success: false, error: "Invalid request type. Use 'id', 'calldata', or 'details'" },
          { status: 400 }
        );
      }
    }

    // Serialize the result for JSON response
    const serialized = serializeSimulationResult(result);

    return NextResponse.json({
      success: true,
      data: serialized,
    } as SimulateResponse);
  } catch (error) {
    console.error("Simulate error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to simulate proposal";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
