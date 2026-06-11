import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";

const SITE_URL = "https://us.shimeruknives.co.uk";

// Affiliate "magic link" login: enter email, we email the portal link.
// Reuses the affiliate's long-lived access_token (minting one if missing).
// Always returns a generic response so we never reveal who is an affiliate.
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, name, status, access_token")
    .eq("email", email)
    .maybeSingle();

  // Only approved affiliates get a link. Respond generically either way.
  if (affiliate && affiliate.status === "approved") {
    let token = affiliate.access_token as string | null;
    if (!token) {
      token = randomBytes(24).toString("hex");
      await supabase.from("affiliates").update({ access_token: token }).eq("id", affiliate.id);
    }

    const portalLink = `${SITE_URL}/affiliate/portal/${token}`;
    const firstName = affiliate.name.split(/\s+/)[0] || "there";
    await sendTransactionalEmail({
      to: email,
      subject: "Your Shimeru Knives affiliate portal link",
      tag: "affiliate-login-link",
      metadata: { affiliate_id: affiliate.id },
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
          <h1 style="font-size:20px;font-weight:600;">Hi ${escapeHtml(firstName)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Here's the link to your affiliate portal, where you can message us and upload content:
          </p>
          <p style="font-size:14px;line-height:1.6;">
            <a href="${portalLink}" style="color:#0a7d3c;">Open your affiliate portal</a>
          </p>
          <p style="font-size:13px;line-height:1.6;color:#888;">
            Keep this link private, anyone with it can access your portal.
          </p>
        </div>
      `,
      text:
        `Hi ${firstName},\n\nHere's the link to your affiliate portal:\n${portalLink}\n\n` +
        `Keep this link private — anyone with it can access your portal.\n\nShimeru Knives`,
    });
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is registered as an approved affiliate, we've sent your portal link.",
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
