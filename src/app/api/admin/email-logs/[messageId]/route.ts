import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ messageId: string }> }
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

  const { messageId } = await ctx.params;

  const res = await fetch(
    `https://api.postmarkapp.com/messages/outbound/${messageId}/details`,
    {
      headers: {
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[email-logs detail] postmark failed:", res.status, text);
    return NextResponse.json(
      { error: "Failed to fetch message details", details: text },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
