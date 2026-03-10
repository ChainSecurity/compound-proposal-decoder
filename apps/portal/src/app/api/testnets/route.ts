import { NextResponse } from "next/server";
import { getTestnetInfo, listVirtualTestnets } from "@compound-security/simulator";

export async function GET(): Promise<NextResponse> {
  try {
    const info = getTestnetInfo();

    // Check if any entries are missing displayName
    const needsLookup = Object.values(info).some((e) => !e.displayName && e.vnetId);

    if (needsLookup) {
      try {
        const allVnets = await listVirtualTestnets();
        const vnetMap = new Map(allVnets.map((v) => [v.id, v.displayName]));

        for (const entry of Object.values(info)) {
          if (!entry.displayName && entry.vnetId) {
            entry.displayName = vnetMap.get(entry.vnetId);
          }
        }
      } catch {
        // Tenderly API unavailable, return what we have
      }
    }

    return NextResponse.json(info);
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
