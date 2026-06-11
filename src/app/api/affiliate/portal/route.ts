import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { withSignedUrls, type AffiliateAttachment } from "@/lib/affiliate-attachments";
import { kindFromContentType } from "@/lib/r2";

const ADMIN_NOTIFY_EMAIL = "mr.davidoak@gmail.com";
const SITE_URL = "https://us.shimeruknives.co.uk";

async function affiliateByToken(token: string) {
  if (!token || token.length < 16) return null;
  const { data } = await getSupabaseAdmin()
    .from("affiliates")
    .select("id, name, email, status, code")
    .eq("access_token", token)
    .maybeSingle();
  return data;
}

// GET: the affiliate's message thread (internal notes excluded).
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  const affiliate = await affiliateByToken(token);
  if (!affiliate) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const { data: rows } = await getSupabaseAdmin()
    .from("affiliate_messages")
    .select("id, direction, content_text, attachments, created_at")
    .eq("affiliate_id", affiliate.id)
    .in("direction", ["inbound", "outbound"])
    .order("created_at", { ascending: true });

  const messages = await Promise.all(
    (rows ?? []).map(async (m) => ({
      id: m.id,
      direction: m.direction,
      content_text: m.content_text,
      created_at: m.created_at,
      attachments: await withSignedUrls(m.attachments as AffiliateAttachment[]),
    }))
  );

  const stats = await affiliateStats(affiliate.id);

  return NextResponse.json({
    affiliate: { name: affiliate.name, status: affiliate.status, code: affiliate.code },
    stats,
    messages,
  });
}

async function affiliateStats(affiliateId: string) {
  const supabase = getSupabaseAdmin();

  const { count: clicks } = await supabase
    .from("affiliate_clicks")
    .select("id", { count: "exact", head: true })
    .eq("affiliate_id", affiliateId);

  const { data: commissions } = await supabase
    .from("affiliate_commissions")
    .select("commission_amount, status")
    .eq("affiliate_id", affiliateId);

  let sales = 0;
  let pending = 0;
  let approved = 0;
  let paid = 0;
  for (const c of commissions ?? []) {
    const amount = Number(c.commission_amount) || 0;
    if (c.status !== "reversed") sales += 1;
    if (c.status === "pending") pending += amount;
    if (c.status === "approved") approved += amount;
    if (c.status === "paid") paid += amount;
  }

  return { clicks: clicks ?? 0, sales, pending, approved, paid };
}

// POST: affiliate sends a message and/or attaches uploaded content.
export async function POST(req: NextRequest) {
  let body: {
    token?: string;
    text?: string;
    attachments?: Array<{ name?: string; key?: string; content_type?: string; size?: number }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const affiliate = await affiliateByToken(token);
  if (!affiliate) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const text = (body.text ?? "").trim();
  const attachments: AffiliateAttachment[] = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a) => a.key && a.name)
    .map((a) => ({
      name: String(a.name).slice(0, 200),
      key: String(a.key),
      content_type: String(a.content_type ?? "application/octet-stream"),
      size: Number(a.size) || 0,
      kind: kindFromContentType(String(a.content_type ?? "")),
    }))
    .slice(0, 20);

  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "Add a message or a file" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("affiliate_messages").insert({
    affiliate_id: affiliate.id,
    direction: "inbound",
    from_addr: affiliate.email,
    content_text: text || null,
    attachments,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }

  // Notify admin (awaited).
  const adminUrl = `${SITE_URL}/admin?tab=affiliates`;
  await sendTransactionalEmail({
    to: ADMIN_NOTIFY_EMAIL,
    subject: `Affiliate message from ${affiliate.name}`,
    tag: "affiliate-message-admin",
    metadata: { affiliate_id: affiliate.id },
    replyTo: affiliate.email,
    text:
      `${affiliate.name} (${affiliate.email}) sent a message via their portal.\n\n` +
      (text ? `"${text}"\n\n` : "") +
      (attachments.length ? `Attachments: ${attachments.length}\n\n` : "") +
      `Review in the admin panel:\n${adminUrl}`,
  });

  return NextResponse.json({ ok: true });
}
