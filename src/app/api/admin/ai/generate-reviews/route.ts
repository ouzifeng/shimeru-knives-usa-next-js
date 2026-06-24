import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAiSettings, generateAndPushReviews } from "@/lib/reviews/generate";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { productId, count, dateFrom, dateTo } = await request.json();

    if (!productId || !count || count < 1 || count > 100) {
      return NextResponse.json({ error: "Provide productId and count (1-100)" }, { status: 400 });
    }
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "Provide dateFrom and dateTo" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const settings = await getAiSettings(admin);
    if (!settings) {
      return NextResponse.json({ error: "AI not configured" }, { status: 400 });
    }

    const outcome = await generateAndPushReviews(admin, { productId, count, dateFrom, dateTo, settings });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate reviews" },
      { status: 500 }
    );
  }
}
