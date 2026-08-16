import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isGoogleIp } from "@/lib/google-ip";

const VALID_EVENTS = [
  "page_view",
  "product_viewed",
  "add_to_cart",
  "remove_from_cart",
  "search",
  "filter_applied",
  "checkout_viewed",
  "coupon_applied",
  "coupon_failed",
  "payment_started",
  "payment_error",
  "payment_completed",
] as const;

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    const body = JSON.parse(text);
    const { event, session_id, product_id, product_name, cart_value, metadata } = body;

    if (!event || !session_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!VALID_EVENTS.includes(event)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const forwarded = req.headers.get("x-forwarded-for") || "";
    const ip = forwarded.split(",")[0].trim() || null;
    const ua = req.headers.get("user-agent") || null;

    // Silently drop events from Google's published IP ranges
    // (Googlebot, GCP, Product Feed crawler, etc.) — they pollute
    // funnel analytics and trigger spurious abandoned-cart rows.
    if (await isGoogleIp(ip)) {
      return NextResponse.json({ ok: true });
    }

    const enrichedMeta = { ...(metadata || {}), ip, ua };

    const { error: insertError } = await getSupabaseAdmin()
      .from("funnel_events")
      .insert({
        event,
        session_id,
        product_id: product_id ?? null,
        product_name: product_name ?? null,
        cart_value: cart_value ?? null,
        metadata: enrichedMeta,
      });

    if (insertError) {
      console.error("[funnel] insert error:", insertError.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
