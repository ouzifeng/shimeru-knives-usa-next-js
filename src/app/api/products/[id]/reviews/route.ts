import { NextRequest, NextResponse } from "next/server";
import { getProductReviewsPage } from "@/lib/woocommerce";

const PER_PAGE = 10;

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
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  try {
    const data = await getProductReviewsPage(productId, page, PER_PAGE);
    return NextResponse.json(data, {
      // Cache so WooCommerce is hit ~once per product/page per hour, not per visitor
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    // WC unreachable — fail soft so the page doesn't break
    return NextResponse.json({ reviews: [], total: 0, totalPages: 1 });
  }
}
