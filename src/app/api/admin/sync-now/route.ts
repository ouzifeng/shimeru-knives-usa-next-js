import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { syncProducts } from "@/lib/sync";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncProducts();
  return NextResponse.json(result);
}
