import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getMarketingTemplate } from "@/lib/email-templates/marketing";

const TEST_RECIPIENT = "mr.davidoak@gmail.com";
const FROM_NAME = "Shimeru Knives";
const FROM_EMAIL = "marketing@shimeruknives.co.uk";

export async function POST(
  _req: NextRequest,
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

  const { subject, html, text } = template.render({
    recipientName: "David",
    campaignId: `${templateId}-test`,
  });

  // Marketing sends go through the BROADCAST stream — must be enabled on
  // the Postmark Server first (LLxBLs0N → Message Streams → add Broadcast).
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      From: `${FROM_NAME} <${FROM_EMAIL}>`,
      To: TEST_RECIPIENT,
      Subject: `[TEST] ${subject}`,
      HtmlBody: html,
      TextBody: text,
      MessageStream: "broadcast",
      Tag: `marketing-test-${templateId}`,
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    return NextResponse.json(
      { error: "Postmark send failed", details },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sent_to: TEST_RECIPIENT });
}
