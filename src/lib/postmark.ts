// Shared Postmark sender for all transactional email (orders, returns,
// support, ambassador comms, etc). Marketing campaigns have their own
// path that hits the broadcast stream — do not use this helper for those.

const DEFAULT_FROM_NAME = "Shimeru Knives";
const DEFAULT_FROM_EMAIL = "sales@us.shimeruknives.co.uk";

export type PostmarkAttachment = {
  Name: string;
  Content: string; // base64
  ContentType: string;
  ContentID?: string;
};

export type SendTransactionalEmailParams = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  /** Postmark Tag — shows up in the Logs tab so we can filter by source. */
  tag?: string;
  /** Postmark Metadata — small key/value map indexable in the Postmark logs. */
  metadata?: Record<string, string>;
  attachments?: PostmarkAttachment[];
  /** Track opens (pixel). Off by default for transactional receipts. */
  trackOpens?: boolean;
  /**
   * Track link clicks. Postmark rewrites links and records a click event tied
   * to this message's Tag + Metadata, so clicks can be attributed per recipient.
   * Pass "HtmlAndText" | "HtmlOnly" | "TextOnly".
   */
  trackLinks?: "HtmlAndText" | "HtmlOnly" | "TextOnly";
};

export type SendTransactionalEmailResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams
): Promise<SendTransactionalEmailResult> {
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    console.warn("[postmark] POSTMARK_SERVER_TOKEN missing — skipping send");
    return { ok: false, error: "POSTMARK_SERVER_TOKEN not configured" };
  }
  if (!params.html && !params.text) {
    return { ok: false, error: "Provide at least one of html / text" };
  }

  const body: Record<string, unknown> = {
    From: `${params.fromName || DEFAULT_FROM_NAME} <${params.fromEmail || DEFAULT_FROM_EMAIL}>`,
    To: params.to,
    Subject: params.subject,
    MessageStream: "outbound",
  };
  if (params.html) body.HtmlBody = params.html;
  if (params.text) body.TextBody = params.text;
  if (params.replyTo) body.ReplyTo = params.replyTo;
  if (params.tag) body.Tag = params.tag;
  if (params.metadata) body.Metadata = params.metadata;
  if (params.trackOpens) body.TrackOpens = true;
  if (params.trackLinks) body.TrackLinks = params.trackLinks;
  if (params.attachments && params.attachments.length > 0) {
    body.Attachments = params.attachments;
  }

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[postmark] send failed:", res.status, params.tag, errText);
      return { ok: false, error: errText };
    }
    const data = (await res.json()) as { MessageID?: string };
    return { ok: true, messageId: data.MessageID };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[postmark] fetch failed:", params.tag, msg);
    return { ok: false, error: msg };
  }
}
