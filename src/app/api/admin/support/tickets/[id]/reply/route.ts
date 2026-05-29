import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

const FROM_NAME = "Shimeru Knives";
const FROM_EMAIL = "sales@us.shimeruknives.co.uk";
const THREADING_DOMAIN = "us.shimeruknives.co.uk";
const STORAGE_BUCKET = "support-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

type StoredAttachment = {
  name: string;
  url: string;
  content_type: string;
  size: number;
};

type PostmarkAttachment = {
  Name: string;
  Content: string;
  ContentType: string;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return NextResponse.json(
      { error: "POSTMARK_SERVER_TOKEN not configured" },
      { status: 500 }
    );
  }

  const { id: ticketId } = await ctx.params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const reply = String(formData.get("message") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!reply && files.length === 0) {
    return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("id, subject, customer_email, status")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 });
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { data: pendingMessage, error: pendingError } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      direction: "outbound",
      from_addr: FROM_EMAIL,
      content_text: reply,
    })
    .select("id")
    .single();

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const messageId = pendingMessage.id;
  const storedAttachments: StoredAttachment[] = [];
  const postmarkAttachments: PostmarkAttachment[] = [];

  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const safeName = sanitizeFilename(file.name || "file");
      const objectPath = `${ticketId}/outbound/${messageId}/${Date.now()}-${safeName}`;
      const contentType = file.type || "application/octet-stream";

      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, buffer, { contentType, upsert: false });

      if (uploadErr) {
        console.error("[support reply] upload failed:", file.name, uploadErr.message);
        continue;
      }

      const { data: signed } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

      storedAttachments.push({
        name: file.name,
        url: signed?.signedUrl ?? "",
        content_type: contentType,
        size: file.size,
      });

      postmarkAttachments.push({
        Name: file.name,
        Content: buffer.toString("base64"),
        ContentType: contentType,
      });
    } catch (err) {
      console.error("[support reply] attachment processing failed:", file.name, err);
    }
  }

  const outboundMessageId = `ticket-${ticketId}-${messageId}@${THREADING_DOMAIN}`;
  const subject = ticket.subject.toLowerCase().startsWith("re:")
    ? ticket.subject
    : `Re: ${ticket.subject}`;

  const postmarkBody: Record<string, unknown> = {
    From: `${FROM_NAME} <${FROM_EMAIL}>`,
    To: ticket.customer_email,
    Subject: subject,
    TextBody: reply || "(no message body)",
    MessageStream: "outbound",
    Headers: [{ Name: "Message-ID", Value: `<${outboundMessageId}>` }],
  };
  if (postmarkAttachments.length > 0) {
    postmarkBody.Attachments = postmarkAttachments;
  }

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(postmarkBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[support reply] postmark failed:", res.status, errText);
    await supabase.from("support_ticket_messages").delete().eq("id", messageId);
    return NextResponse.json(
      { error: "Failed to send reply", details: errText },
      { status: 502 }
    );
  }

  const postmarkResponse = (await res.json().catch(() => null)) as {
    MessageID?: string;
  } | null;

  await supabase
    .from("support_ticket_messages")
    .update({
      postmark_message_id: postmarkResponse?.MessageID ?? outboundMessageId,
      attachments: storedAttachments,
    })
    .eq("id", messageId);

  await supabase
    .from("support_tickets")
    .update({ status: "solved", last_updated: new Date().toISOString() })
    .eq("id", ticketId);

  return NextResponse.json({
    ok: true,
    message_id: messageId,
    attachments: storedAttachments.length,
  });
}
