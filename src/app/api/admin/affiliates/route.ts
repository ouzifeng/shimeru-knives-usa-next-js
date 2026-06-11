import { NextRequest, NextResponse } from "next/server";
import { randomInt, randomBytes } from "crypto";
import { isAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";

const SITE_URL = "https://us.shimeruknives.co.uk";

type AffiliateRow = {
  id: string;
  code: string | null;
  name: string;
  email: string;
  status: string;
  commission_pct: number;
};

// GET: all affiliates, newest first, each with lightweight click + commission stats.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: affiliates, error } = await supabase
    .from("affiliates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats tallied in JS. Volumes are low at launch; move to a DB view/aggregate
  // if clicks grow large.
  const clicksByAffiliate = new Map<string, number>();
  const { data: clicks } = await supabase.from("affiliate_clicks").select("affiliate_id");
  for (const c of clicks ?? []) {
    clicksByAffiliate.set(c.affiliate_id, (clicksByAffiliate.get(c.affiliate_id) ?? 0) + 1);
  }

  const commByAffiliate = new Map<
    string,
    { sales: number; pending: number; approved: number; paid: number }
  >();
  const { data: commissions } = await supabase
    .from("affiliate_commissions")
    .select("affiliate_id, commission_amount, status");
  for (const c of commissions ?? []) {
    const agg =
      commByAffiliate.get(c.affiliate_id) ??
      { sales: 0, pending: 0, approved: 0, paid: 0 };
    const amount = Number(c.commission_amount) || 0;
    if (c.status !== "reversed") agg.sales += 1;
    if (c.status === "pending") agg.pending += amount;
    if (c.status === "approved") agg.approved += amount;
    if (c.status === "paid") agg.paid += amount;
    commByAffiliate.set(c.affiliate_id, agg);
  }

  const withStats = (affiliates ?? []).map((a: AffiliateRow & Record<string, unknown>) => ({
    ...a,
    // never leak bank details to the list view
    bank_details: a.bank_details ? true : false,
    stats: {
      clicks: clicksByAffiliate.get(a.id) ?? 0,
      ...(commByAffiliate.get(a.id) ?? { sales: 0, pending: 0, approved: 0, paid: 0 }),
    },
  }));

  return NextResponse.json(withStats);
}

// PATCH: update status / admin_notes / commission_pct.
// Approving generates the referral code (if missing) and emails the affiliate.
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, status, admin_notes, commission_pct } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Missing affiliate ID" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: affiliate, error: fetchError } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (typeof admin_notes === "string") update.admin_notes = admin_notes;
  if (typeof commission_pct === "number" && commission_pct >= 0 && commission_pct <= 100) {
    update.commission_pct = commission_pct;
  }

  const VALID_STATUSES = ["pending", "approved", "rejected", "suspended"];
  let approvedCode: string | null = affiliate.code;
  let portalToken: string | null = affiliate.access_token;
  const approving = status === "approved" && affiliate.status !== "approved";

  if (status && VALID_STATUSES.includes(status)) {
    update.status = status;
    if (status === "approved") {
      update.approved_at = new Date().toISOString();
      if (!affiliate.code) {
        approvedCode = await generateUniqueCode(supabase);
        update.code = approvedCode;
      }
      if (!affiliate.access_token) {
        portalToken = randomBytes(24).toString("hex"); // 48-char portal token
        update.access_token = portalToken;
      }
    }
  }

  const { error: updateError } = await supabase
    .from("affiliates")
    .update(update)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Email the affiliate on first approval.
  if (approving && approvedCode) {
    const firstName = affiliate.name.split(/\s+/)[0] || "there";
    const link = `${SITE_URL}/?ref=${approvedCode}`;
    const portalLink = portalToken ? `${SITE_URL}/affiliate/portal/${portalToken}` : null;
    await sendTransactionalEmail({
      to: affiliate.email,
      subject: "You're in — welcome to the Shimeru Knives affiliate program",
      tag: "affiliate-approved",
      metadata: { affiliate_id: id },
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
          <h1 style="font-size:20px;font-weight:600;">Welcome aboard, ${escapeHtml(firstName)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Your application has been approved. Here's your personal affiliate link, add
            <strong>?ref=${escapeHtml(approvedCode)}</strong> to any page on our site to share it:
          </p>
          <p style="font-size:14px;line-height:1.6;">
            <a href="${link}" style="color:#0a7d3c;">${link}</a>
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            You earn ${affiliate.commission_pct}% on every order referred through your link, paid
            monthly.
          </p>
          ${
            portalLink
              ? `<p style="font-size:14px;line-height:1.6;color:#444;">
                  Use your private portal to message us and upload content for approval before you post:
                </p>
                <p style="font-size:14px;line-height:1.6;">
                  <a href="${portalLink}" style="color:#0a7d3c;">Open your affiliate portal</a>
                </p>`
              : ""
          }
          <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px;">Shimeru Knives</p>
        </div>
      `,
      text:
        `Welcome aboard, ${firstName}.\n\n` +
        `Your application has been approved. Your affiliate link is:\n${link}\n\n` +
        `Add ?ref=${approvedCode} to any page on our site to share it. You earn ` +
        `${affiliate.commission_pct}% on every referred order, paid monthly.\n\n` +
        (portalLink
          ? `Use your private portal to message us and upload content for approval:\n${portalLink}\n\n`
          : "") +
        `Shimeru Knives`,
    });
  }

  return NextResponse.json({ ok: true, code: approvedCode, access_token: portalToken });
}

// Random, unique referral code. Unambiguous alphabet (no 0/O/1/I) so it's safe
// to read aloud or type. 8 chars = ~1 trillion combinations, collisions checked.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

async function generateUniqueCode(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    const { data } = await supabase
      .from("affiliates")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  // Extremely unlikely fallback: longer random string.
  let code = "";
  for (let i = 0; i < CODE_LENGTH + 4; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
