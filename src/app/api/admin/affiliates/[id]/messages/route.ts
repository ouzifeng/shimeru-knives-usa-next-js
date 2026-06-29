import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { withSignedUrls, type AffiliateAttachment } from "@/lib/affiliate-attachments";

const THREADING_DOMAIN = "us.shimeruknives.co.uk";

// GET: full message thread for an affiliate (includes internal notes).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { data: rows, error } = await getSupabaseAdmin()
    .from("affiliate_messages")
    .select("id, direction, from_addr, content_text, attachments, created_at")
    .eq("affiliate_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = await Promise.all(
    (rows ?? []).map(async (m) => ({
      ...m,
      attachments: await withSignedUrls(m.attachments as AffiliateAttachment[]),
    }))
  );

  return NextResponse.json(messages);
}

// POST: admin sends a message (emailed to the affiliate) or saves an internal note.
//   body: { text, subject?, kind?: 'message' | 'note' }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const { text, subject, kind } = (await req.json()) as {
    text?: string;
    subject?: string;
    kind?: "message" | "note";
  };
  const bodyText = (text ?? "").trim();
  if (!bodyText) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, name, email")
    .eq("id", id)
    .single();

  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  // Internal note — store only, never email.
  if (kind === "note") {
    const { error } = await supabase.from("affiliate_messages").insert({
      affiliate_id: id,
      direction: "note",
      content_text: bodyText,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const emailSubject = (subject ?? "").trim() || "A message from Shimeru Knives";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
      <p style="font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${escapeHtml(bodyText)}</p>
      <p style="font-size:13px;color:#888;margin-top:20px;">Shimeru Knives Affiliate Team</p>
    </div>
  `;

  // Insert the outbound row first so we have its id to build a threadable
  // Message-ID. A reply to this email carries the id in In-Reply-To, letting the
  // inbound webhook fold the reply back into this affiliate's thread (see
  // webhooks/postmark/inbound) instead of opening a stray support ticket.
  const { data: pending, error: insertErr } = await supabase
    .from("affiliate_messages")
    .insert({
      affiliate_id: id,
      direction: "outbound",
      from_addr: "sales@us.shimeruknives.co.uk",
      subject: emailSubject,
      content_text: bodyText,
      content_html: html,
    })
    .select("id")
    .single();

  if (insertErr || !pending) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to record message" }, { status: 500 });
  }

  const outboundMessageId = `affiliate-${id}-${pending.id}@${THREADING_DOMAIN}`;
  const result = await sendTransactionalEmail({
    to: affiliate.email,
    subject: emailSubject,
    tag: "affiliate-message",
    metadata: { affiliate_id: id },
    html,
    text: bodyText,
    headers: [{ Name: "Message-ID", Value: `<${outboundMessageId}>` }],
  });

  if (!result.ok) {
    // Email didn't go out — drop the row so the thread doesn't show a phantom send.
    await supabase.from("affiliate_messages").delete().eq("id", pending.id);
    return NextResponse.json({ error: "Could not send email" }, { status: 502 });
  }

  await supabase
    .from("affiliate_messages")
    .update({ postmark_message_id: result.messageId ?? outboundMessageId })
    .eq("id", pending.id);

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
