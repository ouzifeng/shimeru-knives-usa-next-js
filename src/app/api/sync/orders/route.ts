import { NextRequest, NextResponse } from "next/server";
import { syncOrders } from "@/lib/sync-orders";

// Order sync does serial email + tracking work per transition; give it headroom
// so a batch shipping day can't get the function killed mid-loop.
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncOrders();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
