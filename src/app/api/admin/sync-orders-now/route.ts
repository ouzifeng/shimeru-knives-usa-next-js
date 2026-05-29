import { NextResponse } from "next/server";
import { syncOrders } from "@/lib/sync-orders";

export async function POST() {
  const result = await syncOrders();
  return NextResponse.json(result);
}
