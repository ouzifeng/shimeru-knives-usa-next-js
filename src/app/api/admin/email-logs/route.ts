import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

type PostmarkMessage = {
  MessageID: string;
  Status: string;
  To: Array<{ Email: string; Name?: string }>;
  From: string;
  Subject: string;
  Tag?: string;
  ReceivedAt: string;
  MessageStream: string;
};

type PostmarkListResponse = {
  TotalCount: number;
  Messages: PostmarkMessage[];
};

type PostmarkEvent = { MessageID: string };

async function fetchEventMessageIds(
  endpoint: "opens" | "clicks",
  token: string
): Promise<Set<string>> {
  // Pull the most recent 500 events of this type. Sufficient for any
  // reasonable single page of message logs — we only need presence.
  try {
    const url = new URL(`https://api.postmarkapp.com/messages/outbound/${endpoint}`);
    url.searchParams.set("count", "500");
    url.searchParams.set("offset", "0");
    const res = await fetch(url.toString(), {
      headers: {
        "X-Postmark-Server-Token": token,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return new Set();
    const data = (await res.json()) as { Opens?: PostmarkEvent[]; Clicks?: PostmarkEvent[] };
    const events = data.Opens || data.Clicks || [];
    return new Set(events.map((e) => e.MessageID).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return NextResponse.json(
      { error: "POSTMARK_SERVER_TOKEN not configured" },
      { status: 500 }
    );
  }

  const params = req.nextUrl.searchParams;
  const count = Math.min(Number(params.get("count") || "50"), 500);
  const offset = Math.max(Number(params.get("offset") || "0"), 0);
  const recipient = params.get("recipient")?.trim() || "";
  const status = params.get("status")?.trim() || "";
  const fromDate = params.get("fromdate")?.trim() || "";
  const toDate = params.get("todate")?.trim() || "";

  const url = new URL("https://api.postmarkapp.com/messages/outbound");
  url.searchParams.set("count", String(count));
  url.searchParams.set("offset", String(offset));
  if (recipient) url.searchParams.set("recipient", recipient);
  if (status) url.searchParams.set("status", status);
  if (fromDate) url.searchParams.set("fromdate", fromDate);
  if (toDate) url.searchParams.set("todate", toDate);

  const [listRes, openedIds, clickedIds] = await Promise.all([
    fetch(url.toString(), {
      headers: {
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        Accept: "application/json",
      },
      cache: "no-store",
    }),
    fetchEventMessageIds("opens", process.env.POSTMARK_SERVER_TOKEN),
    fetchEventMessageIds("clicks", process.env.POSTMARK_SERVER_TOKEN),
  ]);

  if (!listRes.ok) {
    const text = await listRes.text();
    console.error("[email-logs] postmark list failed:", listRes.status, text);
    return NextResponse.json(
      { error: "Failed to fetch logs", details: text },
      { status: 502 }
    );
  }

  const data = (await listRes.json()) as PostmarkListResponse;

  return NextResponse.json({
    total: data.TotalCount,
    messages: data.Messages.map((m) => ({
      message_id: m.MessageID,
      status: m.Status,
      to: m.To,
      from: m.From,
      subject: m.Subject,
      tag: m.Tag ?? null,
      stream: m.MessageStream,
      received_at: m.ReceivedAt,
      opened: openedIds.has(m.MessageID),
      clicked: clickedIds.has(m.MessageID),
    })),
  });
}
