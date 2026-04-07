import { NextRequest, NextResponse } from "next/server";
import { getProductReviews } from "@/lib/woocommerce";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = parseInt(id, 10);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const perPage = parseInt(url.searchParams.get("per_page") || "25", 10);

  const reviews = await getProductReviews(productId, { per_page: perPage });

  return NextResponse.json(reviews, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
