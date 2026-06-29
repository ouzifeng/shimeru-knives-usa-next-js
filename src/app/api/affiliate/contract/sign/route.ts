import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";
import { storeConfig } from "../../../../../../store.config";

const ADMIN_NOTIFY_EMAIL = "mr.davidoak@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { token, signed_name } = await req.json();

    if (!token || typeof token !== "string" || token.length < 16) {
      return NextResponse.json({ error: "Invalid token." }, { status: 400 });
    }
    if (!signed_name || typeof signed_name !== "string" || signed_name.trim().length < 2) {
      return NextResponse.json({ error: "Please type your full name." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: affiliate, error: fetchErr } = await admin
      .from("affiliates")
      .select("id, name, email, contract_signed_at, access_token")
      .eq("access_token", token)
      .maybeSingle();

    if (fetchErr || !affiliate) {
      return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
    }

    if (affiliate.contract_signed_at) {
      return NextResponse.json({ error: "Already signed." }, { status: 409 });
    }

    // Soft name-match: same letters in same order, case/whitespace insensitive.
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalize(signed_name) !== normalize(affiliate.name)) {
      return NextResponse.json(
        { error: `Name must match the name on your application (${affiliate.name}).` },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const userAgent = req.headers.get("user-agent") || null;
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await admin
      .from("affiliates")
      .update({
        contract_signed_at: nowIso,
        signed_name: signed_name.trim(),
        signed_ip: ip,
        signed_user_agent: userAgent,
      })
      .eq("id", affiliate.id);

    if (updateErr) {
      console.error("[affiliate sign] update error:", updateErr);
      return NextResponse.json({ error: "Could not record signature." }, { status: 500 });
    }

    // Notify both admin and affiliate (allSettled so a failed email can't fail
    // the signature, which is already recorded).
    const siteUrl = storeConfig.url.replace(/\/$/, "");
    const portalLink = affiliate.access_token
      ? `${siteUrl}/affiliate/portal/${affiliate.access_token}`
      : null;
    const firstName = affiliate.name.split(/\s+/)[0] || "there";

    const [adminRes, affiliateRes] = await Promise.allSettled([
      sendTransactionalEmail({
        to: ADMIN_NOTIFY_EMAIL,
        subject: `[${storeConfig.name}] Affiliate signed agreement: ${affiliate.name}`,
        tag: "affiliate-contract-signed-admin",
        text: `${affiliate.name} (${affiliate.email}) has signed the affiliate agreement on ${nowIso}.`,
      }),
      sendTransactionalEmail({
        to: affiliate.email,
        subject: "Thanks for signing — your Shimeru Knives affiliate agreement",
        tag: "affiliate-contract-signed-affiliate",
        metadata: { affiliate_id: affiliate.id },
        text:
          `Hi ${firstName},\n\n` +
          `Thanks for signing your Shimeru Knives affiliate agreement. A copy of the terms you ` +
          `agreed to is on our site.\n\n` +
          (portalLink
            ? `Next, head to your portal to grab your referral link and add your payout (bank) ` +
              `and shipping details:\n${portalLink}\n\n`
            : "") +
          `Best,\nShimeru Knives`,
      }),
    ]);
    if (adminRes.status === "rejected" || (adminRes.status === "fulfilled" && !adminRes.value.ok)) {
      console.error("[affiliate sign] admin notify failed");
    }
    if (
      affiliateRes.status === "rejected" ||
      (affiliateRes.status === "fulfilled" && !affiliateRes.value.ok)
    ) {
      console.error("[affiliate sign] affiliate confirmation failed");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[affiliate sign] error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
