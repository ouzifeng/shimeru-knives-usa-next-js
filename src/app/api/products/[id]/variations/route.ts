import { NextRequest, NextResponse } from "next/server";
import { getCachedVariations } from "@/lib/variations";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = parseInt(id);

  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const variations = await getCachedVariations(productId);
  return NextResponse.json(variations);
}
