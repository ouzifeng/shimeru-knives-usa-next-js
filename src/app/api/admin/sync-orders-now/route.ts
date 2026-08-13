import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { syncOrders } from "@/lib/sync-orders";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncOrders();
  return NextResponse.json(result);
}
