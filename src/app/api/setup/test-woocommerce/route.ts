import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, consumerKey, consumerSecret } = body;

    if (!url || !consumerKey || !consumerSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const endpoint = new URL("/wp-json/wc/v3/products", url);
    endpoint.searchParams.set("per_page", "1");
    endpoint.searchParams.set("consumer_key", consumerKey);
    endpoint.searchParams.set("consumer_secret", consumerSecret);

    const res = await fetch(endpoint.toString());

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: `WooCommerce API returned ${res.status}: ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }

    // WooCommerce returns X-WP-Total header with total product count
    const totalHeader = res.headers.get("X-WP-Total");
    const productCount = totalHeader ? parseInt(totalHeader, 10) : 0;

    return NextResponse.json({ ok: true, productCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 200 }
    );
  }
}
