import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSupportAdminNotification } from "@/lib/support-notifications";
import { sendTransactionalEmail } from "@/lib/postmark";
import {
  putObject,
  getObjectBytes,
  deleteObject,
  kindFromContentType,
  r2Configured,
} from "@/lib/r2";
import { htmlToText } from "@/lib/html-to-text";
import type { AffiliateAttachment } from "@/lib/affiliate-attachments";

const REGION = "us";
const STORAGE_BUCKET = "support-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_NOTIFY_EMAIL = "mr.davidoak@gmail.com";
const AFFILIATE_ADMIN_URL = "https://us.shimeruknives.co.uk/admin?tab=affiliates";

type PostmarkHeader = { Name: string; Value: string };
type PostmarkAttachment = {
  Name: string;
  /** Base64 bytes. Present when Postmark posts us directly. */
  Content?: string;
  ContentType: string;
  ContentLength: number;
  ContentID?: string;
  /**
   * R2 object key. Present when the inbound proxy Worker has already staged
   * the bytes, which is how anything over Vercel's 4.5MB request body limit
   * reaches us at all. Mutually exclusive with Content in practice.
   */
  Key?: string;
  Bucket?: string;
  /** Set by the proxy when an attachment could not be staged. */
  Skipped?: string;
};
type PostmarkInboundPayload = {
  From: string;
  FromName?: string;
  FromFull?: { Email: string; Name: string };
  To?: string;
  OriginalRecipient?: string;
  Subject?: string;
  MessageID: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Headers?: PostmarkHeader[];
  Attachments?: PostmarkAttachment[];
};

type ProcessedAttachment = {
  name: string;
  url: string;
  content_type: string;
  size: number;
};

function findHeader(headers: PostmarkHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  const match = headers.find((h) => h.Name.toLowerCase() === lower);
  return match?.Value ?? null;
}

/**
 * Extracts the ticket id from a Message-ID-style value like
 *   <ticket-{uuid}-{uuid}@shimeruknives.co.uk>
 * Used to thread replies into existing tickets.
 */
function extractTicketIdFromHeader(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/ticket-([0-9a-f-]{36})-/i);
  return match?.[1] ?? null;
}

/**
 * Extracts the affiliate id from a Message-ID-style value like
 *   <affiliate-{uuid}-{uuid}@us.shimeruknives.co.uk>
 * Affiliate email replies thread back into the affiliate's message log rather
 * than the support queue.
 */
function extractAffiliateIdFromHeader(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/affiliate-([0-9a-f-]{36})-/i);
  return match?.[1] ?? null;
}

/**
 * Resolves an attachment to raw bytes regardless of how it reached us: inline
 * base64 when Postmark posts here directly, or an R2 key when the inbound proxy
 * Worker staged it first. Returns null for attachments the proxy had to skip.
 */
async function attachmentBytes(a: PostmarkAttachment): Promise<Buffer | null> {
  if (a.Key) return getObjectBytes(a.Key);
  if (a.Content) return Buffer.from(a.Content, "base64");
  return null;
}

/**
 * Uploads inbound email attachments to the affiliate R2 bucket and returns them
 * in the AffiliateAttachment shape (key only — view URLs are presigned on read),
 * matching portal uploads so they render in the portal and admin thread. Skips
 * silently if R2 is not configured; never throws so a bad attachment can't fail
 * the whole webhook (which would make Postmark retry forever).
 */
async function storeAffiliateEmailAttachments(
  affiliateId: string,
  messageId: string,
  attachments: PostmarkAttachment[] | undefined
): Promise<AffiliateAttachment[]> {
  if (!attachments?.length || !r2Configured()) return [];
  const safeMsgId = sanitizeFilename(messageId);
  const stored: AffiliateAttachment[] = [];
  for (const a of attachments) {
    try {
      const contentType = a.ContentType || "application/octet-stream";
      const safeName = sanitizeFilename(a.Name || "file");

      // Already in R2 courtesy of the proxy — keep the staged key rather than
      // round-tripping the bytes through Vercel just to rewrite the path.
      let key = a.Key ?? null;
      if (!key) {
        const buffer = await attachmentBytes(a);
        if (!buffer) continue;
        key = `${affiliateId}/email/${safeMsgId}/${Date.now()}-${safeName}`;
        await putObject(key, buffer, contentType);
      }

      stored.push({
        name: a.Name || safeName,
        key,
        content_type: contentType,
        size: a.ContentLength ?? 0,
        kind: kindFromContentType(contentType),
      });
    } catch (err) {
      console.error("[postmark inbound] affiliate attachment upload failed:", a.Name, err);
    }
  }
  return stored;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

async function processAttachments(
  ticketId: string,
  messageId: string,
  attachments: PostmarkAttachment[] | undefined,
  htmlBody: string | null
): Promise<{ processed: ProcessedAttachment[]; htmlBody: string | null }> {
  if (!attachments || attachments.length === 0) {
    return { processed: [], htmlBody };
  }

  const supabase = getSupabaseAdmin();
  const processed: ProcessedAttachment[] = [];
  let updatedHtml = htmlBody;

  for (const attachment of attachments) {
    try {
      if (attachment.Skipped) {
        console.error(
          "[postmark inbound] proxy could not stage attachment:",
          attachment.Name,
          attachment.Skipped
        );
        continue;
      }

      const buffer = await attachmentBytes(attachment);
      if (!buffer) continue;

      const safeName = sanitizeFilename(attachment.Name || "file");
      const objectPath = `${ticketId}/${messageId}/${Date.now()}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, buffer, {
          contentType: attachment.ContentType,
          upsert: false,
        });

      if (uploadErr) {
        console.error("[postmark inbound] upload failed:", attachment.Name, uploadErr.message);
        continue;
      }

      const { data: signed } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

      const url = signed?.signedUrl ?? "";

      processed.push({
        name: attachment.Name,
        url,
        content_type: attachment.ContentType,
        size: attachment.ContentLength,
      });

      // Support attachments live in Supabase Storage, so the proxy's staged
      // copy is now redundant. Failing to clean up is not worth losing the
      // message over, hence the swallowed error.
      if (attachment.Key) {
        try {
          await deleteObject(attachment.Key);
        } catch (cleanupErr) {
          console.error("[postmark inbound] R2 cleanup failed:", attachment.Key, cleanupErr);
        }
      }

      // Rewrite inline cid: references so the admin UI can display embedded images
      if (attachment.ContentID && updatedHtml) {
        const cid = attachment.ContentID.replace(/[<>]/g, "");
        const pattern = new RegExp(`cid:${cid}`, "gi");
        updatedHtml = updatedHtml.replace(pattern, url);
      }
    } catch (err) {
      console.error("[postmark inbound] attachment error:", attachment.Name, err);
    }
  }

  return { processed, htmlBody: updatedHtml };
}

export async function POST(req: NextRequest) {
  // Pins this endpoint to the inbound proxy once cutover is done. Until the
  // env var is set the check is skipped, so this ships safely while Postmark
  // still posts here directly. Before this, anyone who knew the URL could
  // fabricate a support ticket.
  const expectedSecret = process.env.INBOUND_PROXY_SECRET;
  if (expectedSecret && req.headers.get("x-inbound-proxy-secret") !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: PostmarkInboundPayload;
  try {
    payload = (await req.json()) as PostmarkInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.From || !payload.MessageID) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Dedup: Postmark retries non-2xx responses. If we've already stored this MessageID
  // (or one with the same id surfaced via a different code path), ack with 200 and bail.
  const { data: existingMessage } = await supabase
    .from("support_ticket_messages")
    .select("id, ticket_id")
    .eq("postmark_message_id", payload.MessageID)
    .maybeSingle();

  if (existingMessage) {
    return NextResponse.json({ ok: true, deduped: true, ticket_id: existingMessage.ticket_id });
  }

  const customerEmail = (payload.FromFull?.Email ?? payload.From).toLowerCase().trim();
  const customerName =
    payload.FromFull?.Name?.trim() || payload.FromName?.trim() || customerEmail.split("@")[0];
  const subject = (payload.Subject || "No subject").trim();
  // HTML-only senders (iOS Mail, BT/Outlook webmail) ship no plain-text part, so
  // Postmark has nothing to put in StrippedTextReply or TextBody. Recover the body
  // from the HTML rather than storing an empty string.
  const textBody = (
    payload.StrippedTextReply ||
    payload.TextBody ||
    htmlToText(payload.HtmlBody) ||
    ""
  ).trim();
  const htmlBody = payload.HtmlBody ?? null;

  // Threading: prefer In-Reply-To, fall back to References (mail clients vary).
  const inReplyTo = findHeader(payload.Headers, "In-Reply-To");
  const references = findHeader(payload.Headers, "References");
  const headerTicketId =
    extractTicketIdFromHeader(inReplyTo) ?? extractTicketIdFromHeader(references);

  // Affiliate email replies thread back into the affiliate's message log, not
  // the support queue. Handle and return before any ticket work.
  const affiliateId =
    extractAffiliateIdFromHeader(inReplyTo) ?? extractAffiliateIdFromHeader(references);
  if (affiliateId) {
    const { data: dupe } = await supabase
      .from("affiliate_messages")
      .select("id")
      .eq("postmark_message_id", payload.MessageID)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json({ ok: true, deduped: true, affiliate_id: affiliateId });
    }

    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id, name, email")
      .eq("id", affiliateId)
      .maybeSingle();

    if (affiliate) {
      const attachments = await storeAffiliateEmailAttachments(
        affiliate.id,
        payload.MessageID,
        payload.Attachments
      );
      const { error: amErr } = await supabase.from("affiliate_messages").insert({
        affiliate_id: affiliate.id,
        direction: "inbound",
        from_addr: customerEmail,
        subject,
        content_text: textBody || null,
        content_html: htmlBody,
        postmark_message_id: payload.MessageID,
        attachments,
      });

      if (amErr) {
        // Unique-constraint race on postmark_message_id — treat as dedup ack.
        if (amErr.code === "23505") {
          return NextResponse.json({ ok: true, deduped: true, affiliate_id: affiliate.id });
        }
        console.error("[postmark inbound] affiliate message insert failed:", amErr);
        return NextResponse.json({ error: "Failed to store affiliate message" }, { status: 500 });
      }

      // Notify admin, mirroring the affiliate portal route.
      await sendTransactionalEmail({
        to: ADMIN_NOTIFY_EMAIL,
        subject: `Affiliate email reply from ${affiliate.name}`,
        tag: "affiliate-message-admin",
        metadata: { affiliate_id: affiliate.id },
        replyTo: affiliate.email,
        text:
          `${affiliate.name} (${affiliate.email}) replied by email.\n\n` +
          (textBody ? `"${textBody}"\n\n` : "") +
          (attachments.length ? `Attachments: ${attachments.length}\n\n` : "") +
          `Review in the admin panel:\n${AFFILIATE_ADMIN_URL}`,
      });

      return NextResponse.json({ ok: true, affiliate_id: affiliate.id });
    }
    // Header named an affiliate we can't find — fall through to a support ticket.
  }

  let parentTicketId: string | null = null;
  if (headerTicketId) {
    const { data: parent } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("id", headerTicketId)
      .maybeSingle();
    if (parent) parentTicketId = parent.id;
  }

  let ticketId: string;
  if (parentTicketId) {
    ticketId = parentTicketId;
    // Existing ticket — bump back to pending so it surfaces in the admin queue.
    await supabase
      .from("support_tickets")
      .update({ status: "pending", last_updated: new Date().toISOString() })
      .eq("id", ticketId);
  } else {
    const { data: newTicket, error: createErr } = await supabase
      .from("support_tickets")
      .insert({
        region: REGION,
        customer_email: customerEmail,
        customer_name: customerName,
        subject,
        status: "pending",
        source: "email",
      })
      .select("id")
      .single();

    if (createErr || !newTicket) {
      console.error("[postmark inbound] ticket create failed:", createErr);
      return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
    }
    ticketId = newTicket.id;
  }

  const { data: messageRow, error: messageErr } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      direction: "inbound",
      from_addr: customerEmail,
      content_text: textBody,
      content_html: htmlBody,
      postmark_message_id: payload.MessageID,
    })
    .select("id")
    .single();

  if (messageErr || !messageRow) {
    // Could be the unique-constraint race on postmark_message_id — treat as dedup ack.
    if (messageErr?.code === "23505") {
      return NextResponse.json({ ok: true, deduped: true });
    }
    console.error("[postmark inbound] message insert failed:", messageErr);
    return NextResponse.json({ error: "Failed to store message" }, { status: 500 });
  }

  const { processed, htmlBody: rewrittenHtml } = await processAttachments(
    ticketId,
    messageRow.id,
    payload.Attachments,
    htmlBody
  );

  if (processed.length > 0 || rewrittenHtml !== htmlBody) {
    await supabase
      .from("support_ticket_messages")
      .update({
        attachments: processed,
        content_html: rewrittenHtml,
      })
      .eq("id", messageRow.id);
  }

  await sendSupportAdminNotification({
    kind: parentTicketId ? "customer_reply" : "new_ticket",
    ticketId,
    subject,
    customerName,
    customerEmail,
    source: "email",
    messageContent: textBody,
  });

  return NextResponse.json({ ok: true, ticket_id: ticketId, message_id: messageRow.id });
}
