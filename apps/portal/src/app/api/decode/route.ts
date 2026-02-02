import { NextRequest, NextResponse } from "next/server";
import {
  decodeProposal,
  decodeProposalFromCalldata,
  decodeProposalFromDetails,
} from "@compound-security/decoder";
import { serializeBigInts } from "@/lib/serialization";
import type {
  DecodeRequest,
  DecodeResponse,
  DecodeRequestWithOptions,
  SourcedDecodeResponse,
  SerializedDecodedProposal,
  SourcedSerializedDecodedProposal,
} from "@/types/decoder";

export async function POST(
  request: NextRequest
): Promise<NextResponse<DecodeResponse | SourcedDecodeResponse>> {
  try {
    const body = (await request.json()) as DecodeRequestWithOptions;

    // Extract options
    const trackSources = body.options?.trackSources ?? false;

    let result;

    // Build decoder options
    const decoderOptions = trackSources ? { trackSources } : undefined;

    switch (body.type) {
      case "id": {
        if (typeof body.proposalId !== "number" || body.proposalId < 0) {
          return NextResponse.json(
            { success: false, error: "proposalId must be a non-negative number" },
            { status: 400 }
          );
        }
        result = await decodeProposal(body.proposalId, decoderOptions);
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
        result = await decodeProposalFromCalldata(body.calldata, decoderOptions);
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
          descriptionHash: descriptionHash || "0x",
        };

        const metadata = body.metadata
          ? {
              governor: body.metadata.governor,
              proposalId: body.metadata.proposalId
                ? BigInt(body.metadata.proposalId)
                : undefined,
              chainId: body.metadata.chainId,
            }
          : {};

        result = await decodeProposalFromDetails(proposalDetails, metadata, decoderOptions);
        break;
      }

      default: {
        return NextResponse.json(
          { success: false, error: "Invalid request type. Use 'id', 'calldata', or 'details'" },
          { status: 400 }
        );
      }
    }

    // Serialize BigInts to strings for JSON response
    const serialized = serializeBigInts(result) as
      | SerializedDecodedProposal
      | SourcedSerializedDecodedProposal;

    // Add source tracking flag to response if enabled
    if (trackSources) {
      (serialized as SourcedSerializedDecodedProposal).sourcesTracked = true;
    }

    return NextResponse.json({
      success: true,
      data: serialized,
    } as DecodeResponse | SourcedDecodeResponse);
  } catch (error) {
    console.error("Decode error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to decode proposal";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
