import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { presignUpload, r2Configured } from "@/lib/r2";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

// Affiliate (token-auth) requests a presigned PUT URL, then uploads the file
// straight to R2 from the browser. The object key is returned so the client can
// attach it to a portal message once the upload finishes.
export async function POST(req: NextRequest) {
  if (!r2Configured()) {
    return NextResponse.json({ error: "Uploads are not configured yet." }, { status: 503 });
  }

  let body: { token?: string; filename?: string; content_type?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const filename = (body.filename ?? "").trim();
  const contentType = (body.content_type ?? "").trim();
  const size = Number(body.size) || 0;

  if (token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  if (!filename || !contentType) {
    return NextResponse.json({ error: "Missing file details" }, { status: 400 });
  }
  if (!contentType.startsWith("video/") && !contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only image and video files are allowed" }, { status: 415 });
  }
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2 GB)" }, { status: 413 });
  }

  const supabase = getSupabaseAdmin();
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, status")
    .eq("access_token", token)
    .maybeSingle();

  if (!affiliate) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  const rand = Math.random().toString(36).slice(2, 8);
  const key = `${affiliate.id}/${Date.now()}-${rand}-${sanitizeFilename(filename)}`;
  const url = await presignUpload(key, contentType);

  return NextResponse.json({ url, key });
}
