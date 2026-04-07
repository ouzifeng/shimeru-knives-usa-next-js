import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const VALID_EVENTS = [
  "add_to_cart",
  "checkout_viewed",
  "payment_started",
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

    const { error: insertError } = await getSupabaseAdmin()
      .from("funnel_events")
      .insert({
        event,
        session_id,
        product_id: product_id ?? null,
        product_name: product_name ?? null,
        cart_value: cart_value ?? null,
        metadata: metadata ?? null,
      });

    if (insertError) {
      console.error("[funnel] insert error:", insertError.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
