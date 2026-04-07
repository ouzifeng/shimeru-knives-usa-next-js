import { NextResponse } from "next/server";
import { syncProducts } from "@/lib/sync";

export async function POST() {
  const result = await syncProducts();
  return NextResponse.json(result);
}
