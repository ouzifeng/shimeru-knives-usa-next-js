import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/postmark";

type Channel = { platform?: string; handle?: string };

type Body = {
  name?: string;
  email?: string;
  country?: string;
  social_channels?: Channel[];
  audience_size?: string;
  prior_experience?: string | boolean;
  on_camera?: string;
  content_license_agreed?: boolean;
  pitch?: string;
};

const AUDIENCE_BANDS = ["<1k", "1k-10k", "10k-50k", "50k-250k", "250k+"];
const ON_CAMERA = ["yes", "no", "sometimes"];

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const country = body.country?.trim() ?? "";
  const audienceSize = body.audience_size?.trim() ?? "";
  const onCamera = body.on_camera?.trim() ?? "";
  const pitch = body.pitch?.trim() ?? "";
  const priorExperience =
    body.prior_experience === true || body.prior_experience === "true";
  const licenseAgreed = body.content_license_agreed === true;

  // Sanitise channels: keep only rows with a handle, cap the count.
  const channels = (Array.isArray(body.social_channels) ? body.social_channels : [])
    .map((c) => ({
      platform: (c.platform ?? "").toString().trim().slice(0, 40),
      handle: (c.handle ?? "").toString().trim().slice(0, 200),
    }))
    .filter((c) => c.handle)
    .slice(0, 20);

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (channels.length === 0) {
    return NextResponse.json({ error: "Add at least one social channel" }, { status: 400 });
  }
  if (!AUDIENCE_BANDS.includes(audienceSize)) {
    return NextResponse.json({ error: "Select your audience size" }, { status: 400 });
  }
  if (!ON_CAMERA.includes(onCamera)) {
    return NextResponse.json({ error: "Please answer the on-camera question" }, { status: 400 });
  }
  if (!licenseAgreed) {
    return NextResponse.json(
      { error: "Content licence consent is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  // One application per email.
  const { data: existing } = await supabase
    .from("affiliates")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "You have already applied with this email. We'll be in touch." },
      { status: 409 }
    );
  }

  const { data: affiliate, error: insertError } = await supabase
    .from("affiliates")
    .insert({
      name,
      email,
      country: country || null,
      social_channels: channels,
      audience_size: audienceSize,
      prior_experience: priorExperience,
      on_camera: onCamera,
      content_license_agreed: licenseAgreed,
      pitch: pitch || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation = raced duplicate email.
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You have already applied with this email. We'll be in touch." },
        { status: 409 }
      );
    }
    console.error("[affiliate-apply] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }

  // Notify the admin that a new application landed.
  const adminEmail = "mr.davidoak@gmail.com";
  const channelsHtml = channels
    .map((c) => `<li>${escapeHtml(c.platform || "Channel")}: ${escapeHtml(c.handle)}</li>`)
    .join("");
  await sendTransactionalEmail({
    to: adminEmail,
    subject: `New affiliate application: ${name}`,
    tag: "affiliate-application-admin",
    metadata: { affiliate_id: affiliate.id },
    replyTo: email,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
        <h1 style="font-size:18px;font-weight:600;">New affiliate application</h1>
        <table style="font-size:14px;line-height:1.6;color:#333;border-collapse:collapse;">
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Name</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Email</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Country</td><td>${escapeHtml(country || "-")}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Audience</td><td>${escapeHtml(audienceSize)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Done this before</td><td>${priorExperience ? "Yes" : "No"}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#888;">On camera</td><td>${escapeHtml(onCamera)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#888;">Ad licence</td><td>${licenseAgreed ? "Agreed" : "No"}</td></tr>
        </table>
        <p style="font-size:14px;color:#333;margin:14px 0 4px;font-weight:600;">Channels</p>
        <ul style="font-size:14px;line-height:1.6;color:#333;margin:0;padding-left:18px;">${channelsHtml}</ul>
        ${pitch ? `<p style="font-size:14px;color:#333;margin:14px 0 4px;font-weight:600;">Pitch</p><p style="font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${escapeHtml(pitch)}</p>` : ""}
        <p style="font-size:13px;color:#888;margin-top:20px;">Review and approve in the admin affiliates section.</p>
      </div>
    `,
    text:
      `New affiliate application\n\n` +
      `Name: ${name}\nEmail: ${email}\nCountry: ${country || "-"}\n` +
      `Audience: ${audienceSize}\nDone this before: ${priorExperience ? "Yes" : "No"}\n` +
      `On camera: ${onCamera}\nAd licence: ${licenseAgreed ? "Agreed" : "No"}\n\n` +
      `Channels:\n${channels.map((c) => `- ${c.platform || "Channel"}: ${c.handle}`).join("\n")}\n` +
      (pitch ? `\nPitch:\n${pitch}\n` : "") +
      `\nReview and approve in the admin affiliates section.`,
  });

  const firstName = name.split(/\s+/)[0] || "there";
  await sendTransactionalEmail({
    to: email,
    subject: "We've received your affiliate application",
    tag: "affiliate-application-received",
    metadata: { affiliate_id: affiliate.id },
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
        <h1 style="font-size:20px;font-weight:600;">Thanks for applying, ${escapeHtml(firstName)}</h1>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          We've received your application to the Shimeru Knives affiliate program. We review every
          applicant personally, so give us a little time. We'll email you as soon as we have a
          decision.
        </p>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          If you're approved, you'll get your own affiliate link and access to your dashboard,
          where you can track clicks, sales, and earnings.
        </p>
        <p style="font-size:14px;line-height:1.6;color:#444;margin-top:24px;">
          Shimeru Knives
        </p>
      </div>
    `,
    text:
      `Thanks for applying, ${firstName}.\n\n` +
      `We've received your application to the Shimeru Knives affiliate program. ` +
      `We review every applicant personally, so give us a little time. We'll email you ` +
      `as soon as we have a decision.\n\n` +
      `If you're approved, you'll get your own affiliate link and a dashboard to track ` +
      `clicks, sales, and earnings.\n\nShimeru Knives`,
  });

  return NextResponse.json({ ok: true, affiliate_id: affiliate.id });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
