import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";

const SITE_URL = "https://us.shimeruknives.co.uk";

// POST: email the affiliate a link to sign their agreement. Generates a portal
// access_token if the affiliate doesn't have one yet.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const supabase = getSupabaseAdmin();
  const { data: affiliate, error } = await supabase
    .from("affiliates")
    .select("id, name, email, access_token, contract_signed_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  let token = affiliate.access_token as string | null;
  if (!token) {
    token = randomBytes(24).toString("hex"); // 48-char portal token
    const { error: updErr } = await supabase
      .from("affiliates")
      .update({ access_token: token })
      .eq("id", id);
    if (updErr) {
      return NextResponse.json({ error: "Could not generate signing link" }, { status: 500 });
    }
  }

  const link = `${SITE_URL}/affiliate/agreement/${token}`;
  const firstName = affiliate.name.split(/\s+/)[0] || "there";

  const result = await sendTransactionalEmail({
    to: affiliate.email,
    subject: "Your Shimeru Knives affiliate agreement — please sign",
    tag: "affiliate-agreement-send",
    metadata: { affiliate_id: id },
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
        <h1 style="font-size:20px;font-weight:600;">Your affiliate agreement</h1>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          Hi ${escapeHtml(firstName)}, please review and sign your Shimeru Knives affiliate
          agreement at the link below. It only takes a minute, type your name to sign.
        </p>
        <p style="font-size:14px;line-height:1.6;">
          <a href="${link}" style="color:#0a7d3c;">Review and sign your agreement</a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#888;margin-top:24px;">Shimeru Knives</p>
      </div>
    `,
    text:
      `Hi ${firstName},\n\n` +
      `Please review and sign your Shimeru Knives affiliate agreement here:\n${link}\n\n` +
      `It only takes a minute, type your name to sign.\n\nShimeru Knives`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Could not send email" }, { status: 502 });
  }

  // Record the send so the admin sees "Awaiting signature".
  const sentAt = new Date().toISOString();
  await supabase.from("affiliates").update({ agreement_sent_at: sentAt }).eq("id", id);

  return NextResponse.json({
    ok: true,
    alreadySigned: !!affiliate.contract_signed_at,
    agreement_sent_at: sentAt,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
