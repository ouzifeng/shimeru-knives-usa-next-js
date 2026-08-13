import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getAllShippingZonesWithMethods } from "@/lib/shipping";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
