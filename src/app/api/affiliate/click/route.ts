import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Logs an affiliate link click. Fired client-side when a visitor lands with
// ?ref=CODE. Only logs clicks for codes that map to an approved affiliate.
export async function POST(req: NextRequest) {
  let body: { code?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase().slice(0, 32);
  if (!/^[A-Z0-9]+$/.test(code)) {
    return NextResponse.json({ ok: true }); // ignore junk quietly
  }

  const supabase = getSupabaseAdmin();
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, status")
    .eq("code", code)
    .maybeSingle();

  // Unknown code or not approved — accept silently, log nothing.
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ ok: true });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent")?.slice(0, 400) || null;

  await supabase.from("affiliate_clicks").insert({
    affiliate_id: affiliate.id,
    landing_path: (body.path ?? "").slice(0, 300) || null,
    ip,
    ua,
  });

  return NextResponse.json({ ok: true });
}
