import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { publishableKey, secretKey } = body;

    if (!publishableKey || !secretKey) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate publishable key format
    if (!publishableKey.startsWith("pk_")) {
      return NextResponse.json(
        { ok: false, error: "Publishable key should start with pk_" },
        { status: 200 }
      );
    }

    // Validate secret key format
    if (!secretKey.startsWith("sk_")) {
      return NextResponse.json(
        { ok: false, error: "Secret key should start with sk_" },
        { status: 200 }
      );
    }

    // Create a temporary Stripe client and test with balance.retrieve()
    const stripe = new Stripe(secretKey);
    await stripe.balance.retrieve();

    // Determine mode from the key prefix
    const mode = secretKey.startsWith("sk_live_") ? "live" : "test";

    return NextResponse.json({ ok: true, mode });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 200 }
    );
  }
}
