import { NextResponse } from "next/server";
import { getAllShippingZonesWithMethods } from "@/lib/shipping";

export async function GET() {
  try {
    const zones = await getAllShippingZonesWithMethods();
    return NextResponse.json({ ok: true, zones });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to fetch shipping" },
      { status: 500 }
    );
  }
}
