const ADMIN_EMAIL = "mr.davidoak@gmail.com";
const FROM_NAME = "Shimeru Support";
const FROM_EMAIL = "sales@us.shimeruknives.co.uk";
const ADMIN_URL = "https://us.shimeruknives.co.uk/admin?tab=support";

type NotificationArgs = {
  kind: "new_ticket" | "customer_reply";
  ticketId: string;
  subject: string;
  customerName: string | null;
  customerEmail: string;
  customerPhone?: string | null;
  orderNumber?: string | null;
  source: "contact_form" | "email";
  messageContent: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendSupportAdminNotification(args: NotificationArgs): Promise<void> {
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    console.warn("[support-notifications] POSTMARK_SERVER_TOKEN missing — skipping notification");
    return;
  }

  const isReply = args.kind === "customer_reply";
  const displayName = args.customerName || args.customerEmail;
  const ticketUrl = ADMIN_URL;

  const subjectLine = isReply
    ? `Reply on ticket: ${args.subject}`
    : `New ticket: ${args.subject}`;

  const sourceLabel = args.source === "contact_form" ? "Contact form" : "Email";
  const messagePreview = args.messageContent.trim() || "(empty body)";

  const textBody = [
    isReply
      ? `${displayName} replied to a ticket.`
      : `${displayName} opened a new ticket via ${sourceLabel.toLowerCase()}.`,
    "",
    `From:     ${displayName} <${args.customerEmail}>`,
    args.customerPhone ? `Phone:    ${args.customerPhone}` : null,
    args.orderNumber ? `Order:    #${args.orderNumber}` : null,
    `Subject:  ${args.subject}`,
    `Source:   ${sourceLabel}`,
    `Ticket:   ${args.ticketId}`,
    "",
    "---",
    messagePreview,
    "---",
    "",
    `View in admin: ${ticketUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
    ${isReply ? "Reply on ticket" : "New support ticket"}
  </h2>
  <p style="margin: 0 0 16px 0; color: #555; font-size: 14px;">
    ${escapeHtml(displayName)} ${isReply ? "replied to a ticket" : `opened a new ticket via ${sourceLabel.toLowerCase()}`}.
  </p>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
    <tr><td style="padding: 4px 0; color: #666; width: 90px;">From</td><td style="padding: 4px 0;"><strong>${escapeHtml(displayName)}</strong> &lt;${escapeHtml(args.customerEmail)}&gt;</td></tr>
    ${args.customerPhone ? `<tr><td style="padding: 4px 0; color: #666;">Phone</td><td style="padding: 4px 0;">${escapeHtml(args.customerPhone)}</td></tr>` : ""}
    ${args.orderNumber ? `<tr><td style="padding: 4px 0; color: #666;">Order</td><td style="padding: 4px 0;">#${escapeHtml(args.orderNumber)}</td></tr>` : ""}
    <tr><td style="padding: 4px 0; color: #666;">Subject</td><td style="padding: 4px 0;">${escapeHtml(args.subject)}</td></tr>
    <tr><td style="padding: 4px 0; color: #666;">Source</td><td style="padding: 4px 0;">${sourceLabel}</td></tr>
  </table>
  <div style="border-left: 3px solid #e5e5e5; padding: 4px 0 4px 14px; margin-bottom: 24px; white-space: pre-wrap; font-size: 14px; line-height: 1.5; color: #222;">
${escapeHtml(messagePreview)}
  </div>
  <a href="${ticketUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500;">View in admin</a>
  <p style="margin: 28px 0 0 0; font-size: 11px; color: #999;">Ticket ID: ${args.ticketId}</p>
</div>`.trim();

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: `${FROM_NAME} <${FROM_EMAIL}>`,
        To: ADMIN_EMAIL,
        ReplyTo: args.customerEmail,
        Subject: subjectLine,
        TextBody: textBody,
        HtmlBody: htmlBody,
        MessageStream: "outbound",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[support-notifications] postmark failed:", res.status, err);
    }
  } catch (err) {
    console.error("[support-notifications] fetch failed:", err);
  }
}
