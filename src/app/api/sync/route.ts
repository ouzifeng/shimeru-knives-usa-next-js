import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncProducts } from "@/lib/sync";

async function handleSync(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncProducts();

  // If products were synced, revalidate cached pages
  if (result.synced > 0) {
    revalidatePath("/");
    revalidatePath("/product");
    revalidatePath("/product/[slug]", "page");
  }

  return NextResponse.json(result);
}

// Vercel Cron sends GET requests
export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
