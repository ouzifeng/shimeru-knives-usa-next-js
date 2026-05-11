import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = Number(body?.product_id);
    const email = String(body?.email || "").trim().toLowerCase();

    if (!productId || !email.includes("@") || email.length > 254) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const { data: product, error: productErr } = await sb
      .from("products")
      .select("id, name, slug, stock_status")
      .eq("id", productId)
      .single();

    if (productErr || !product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    if (product.stock_status === "instock") {
      return NextResponse.json(
        { error: "This product is already in stock." },
        { status: 400 }
      );
    }

    const { error: insertErr } = await sb.from("stock_notifications").insert({
      product_id: product.id,
      product_name: product.name,
      product_slug: product.slug,
      email,
    });

    if (insertErr) {
      // 23505 = unique violation = already subscribed for this product. Treat as ok.
      if (insertErr.code === "23505") {
        return NextResponse.json({ ok: true, alreadySubscribed: true });
      }
      console.error("[stock-notify] insert error:", insertErr);
      return NextResponse.json(
        { error: "Could not save your request." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stock-notify] error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
