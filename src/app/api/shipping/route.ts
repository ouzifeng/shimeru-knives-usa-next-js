import { NextResponse } from "next/server";
import { getShippingOptions } from "@/lib/shipping";

export async function GET() {
  const options = await getShippingOptions();
  return NextResponse.json(options, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
