import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { renderOrderConfirmed } from "@/lib/email-templates/order-confirmed";
import { buildOrderConfirmedFromLatestOrder } from "@/lib/email-templates/order-confirmed-data";

const TEST_RECIPIENT = "mr.davidoak@gmail.com";
const FROM_NAME = "Shimeru Knives";
const FROM_EMAIL = "sales@us.shimeruknives.co.uk";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return NextResponse.json(
      { error: "POSTMARK_SERVER_TOKEN not configured" },
      { status: 500 }
    );
  }

  const result = await buildOrderConfirmedFromLatestOrder();
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  const { subject, html, text } = renderOrderConfirmed(result.data);

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
      MessageStream: "outbound",
      Tag: "template-test-order-confirmed",
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
