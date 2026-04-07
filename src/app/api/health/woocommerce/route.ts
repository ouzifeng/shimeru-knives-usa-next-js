import { NextResponse } from "next/server";
import { getProducts } from "@/lib/woocommerce";

export async function GET() {
  try {
    await getProducts({ per_page: 1 });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
