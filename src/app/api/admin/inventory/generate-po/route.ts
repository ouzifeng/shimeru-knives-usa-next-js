import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generatePODraft } from "@/lib/inventory";

export async function POST() {
  try {
    const sb = getSupabaseAdmin();
    const po = await generatePODraft(sb);
    return NextResponse.json(po);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
