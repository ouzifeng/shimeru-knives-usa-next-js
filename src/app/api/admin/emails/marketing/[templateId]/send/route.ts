import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getMarketingTemplate } from "@/lib/email-templates/marketing";
import { resolveSegmentRecipients, type Segment } from "@/lib/marketing-recipients";
import { getSupabaseAdmin } from "@/lib/supabase";

// Vercel Pro plan — allow up to 5 minutes for the campaign send. At ~5s
// per 500-email batch this comfortably covers 30k+ recipients per call.
export const maxDuration = 300;

const FROM_NAME = "Shimeru Knives";
const FROM_EMAIL = "marketing@shimeruknives.co.uk";
const POSTMARK_BATCH_SIZE = 500;

const VALID_SEGMENTS = new Set<Segment>([
  "all",
  "vip",
  "repeat",
  "new",
  "abandoned-only",
]);

type PostmarkBatchResp = Array<{
  ErrorCode: number;
  Message: string;
  MessageID?: string;
  To?: string;
}>;

type PostmarkSuppression = {
  EmailAddress: string;
  SuppressionReason: string;
  Origin: string;
  CreatedAt: string;
};

/**
 * Pull every suppressed address on the broadcast stream. Postmark caps
 * the dump endpoint at 500 per call so we paginate. The full list for a
 * Shimeru-scale store fits in a single round trip; this is defensive.
 */
async function fetchBroadcastSuppressions(token: string): Promise<Set<string>> {
  const suppressed = new Set<string>();
  const PAGE = 500;
  let offset = 0;
  // Cap iterations as a safety belt — 10k suppressions would be off-the-charts.
  for (let i = 0; i < 20; i++) {
    const url = new URL(
      "https://api.postmarkapp.com/message-streams/broadcast/suppressions/dump"
    );
    url.searchParams.set("count", String(PAGE));
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url.toString(), {
      headers: {
        "X-Postmark-Server-Token": token,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        "[campaign send] suppression dump failed:",
        res.status,
        await res.text().catch(() => "")
      );
      break; // fail open — better to send than to refuse
    }
    const data = (await res.json()) as { Suppressions?: PostmarkSuppression[] };
    const batch = data.Suppressions || [];
    for (const s of batch) {
      if (s.EmailAddress) suppressed.add(s.EmailAddress.toLowerCase());
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return suppressed;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ templateId: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return NextResponse.json(
      { error: "POSTMARK_SERVER_TOKEN not configured" },
      { status: 500 }
    );
  }

  const { templateId } = await ctx.params;
  const template = getMarketingTemplate(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { segment?: string };
  const segment = body.segment as Segment;
  if (!segment || !VALID_SEGMENTS.has(segment)) {
    return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
  }

  const allRecipients = await resolveSegmentRecipients(segment);
  if (allRecipients.length === 0) {
    return NextResponse.json(
      { error: "No recipients in this segment" },
      { status: 400 }
    );
  }

  // Pull the broadcast stream's suppression list and filter them out
  // up front. Postmark would silently reject them on send (ErrorCode 406)
  // but doing it ourselves means clean stats and no error noise.
  const suppressedSet = await fetchBroadcastSuppressions(
    process.env.POSTMARK_SERVER_TOKEN
  );

  const recipients = allRecipients.filter(
    (r) => !suppressedSet.has(r.email.toLowerCase())
  );
  const suppressedCount = allRecipients.length - recipients.length;

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error: `All ${allRecipients.length} recipients in this segment have unsubscribed.`,
      },
      { status: 400 }
    );
  }

  // Insert the campaign row up front so the snapshot exists even if sending
  // partially fails. The campaignId is also what we pass to the template
  // for UTM tagging — so we snapshot the rendered output AFTER we have it.
  const supabase = getSupabaseAdmin();
  const campaignName = template.name;

  const { data: campaignRow, error: insertErr } = await supabase
    .from("marketing_campaigns")
    .insert({
      template_id: templateId,
      name: campaignName,
      subject: "(pending)",
      html_snapshot: "(pending)",
      segment,
      recipient_count: recipients.length,
      unsubscribed_count: suppressedCount, // reused: pre-filtered opt-outs
      status: "sending",
      sent_by: "admin",
    })
    .select("id")
    .single();

  if (insertErr || !campaignRow) {
    return NextResponse.json(
      { error: insertErr?.message || "Failed to create campaign row" },
      { status: 500 }
    );
  }
  const campaignId = campaignRow.id as string;

  // Render once per recipient name. For most templates the only personalisation
  // is the first name, so we render once per *unique first name* to avoid
  // re-rendering 1500 times. (Almost identical outputs anyway since URLs use
  // the campaign id, not the recipient.)
  const { subject, html, text } = template.render({
    recipientName: "there", // generic snapshot — actual sends personalise below
    campaignId,
  });

  await supabase
    .from("marketing_campaigns")
    .update({
      subject,
      html_snapshot: html,
      text_snapshot: text,
    })
    .eq("id", campaignId);

  // Batch send via Postmark
  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += POSTMARK_BATCH_SIZE) {
    const slice = recipients.slice(i, i + POSTMARK_BATCH_SIZE);
    const messages = slice.map((r) => {
      const personalised = template.render({
        recipientName: r.name?.split(/\s+/)[0] || "there",
        campaignId,
      });
      return {
        From: `${FROM_NAME} <${FROM_EMAIL}>`,
        To: r.email,
        Subject: personalised.subject,
        HtmlBody: personalised.html,
        TextBody: personalised.text,
        MessageStream: "broadcast",
        Tag: `campaign-${campaignId}`,
        Metadata: { campaign_id: campaignId, template_id: templateId },
      };
    });

    try {
      const res = await fetch("https://api.postmarkapp.com/email/batch", {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push(`Batch ${i / POSTMARK_BATCH_SIZE + 1}: ${res.status} ${text.slice(0, 200)}`);
        failedCount += slice.length;
        continue;
      }
      const results = (await res.json()) as PostmarkBatchResp;
      for (const r of results) {
        if (r.ErrorCode === 0) sentCount++;
        else failedCount++;
      }
    } catch (err) {
      errors.push(
        `Batch ${i / POSTMARK_BATCH_SIZE + 1}: ${err instanceof Error ? err.message : "unknown"}`
      );
      failedCount += slice.length;
    }
  }

  const finalStatus =
    failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";

  await supabase
    .from("marketing_campaigns")
    .update({
      status: finalStatus,
    })
    .eq("id", campaignId);

  return NextResponse.json({
    ok: true,
    campaign_id: campaignId,
    sent: sentCount,
    failed: failedCount,
    suppressed: suppressedCount,
    status: finalStatus,
    errors: errors.length > 0 ? errors : undefined,
  });
}
