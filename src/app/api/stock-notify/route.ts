import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { storeConfig } from "../../../../store.config";

const ADMIN_NOTIFY_EMAIL = "mr.davidoak@gmail.com";
const SENDER = { name: "Shimeru Knives", email: "sales@shimeruknives.co.uk" };
// Note: US storefront intentionally does NOT add subscribers to a Brevo list —
// the existing list (ID 9 in UK) is for UK customers only.

async function notifyAdmin(productName: string, productSlug: string, email: string) {
  const productUrl = `${storeConfig.url}/product/${productSlug}`;
  const html = `<p>New back-in-stock subscription on <strong>${storeConfig.name}</strong>:</p>
<ul>
  <li><strong>Email:</strong> ${email}</li>
  <li><strong>Product:</strong> <a href="${productUrl}">${productName}</a></li>
</ul>`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      replyTo: SENDER,
      to: [{ email: ADMIN_NOTIFY_EMAIL }],
      subject: `[${storeConfig.name}] Back-in-stock signup: ${productName}`,
      htmlContent: html,
    }),
  });
  if (!res.ok) console.error("[stock-notify] admin email failed:", await res.text());
}

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

    // Best-effort admin email — subscription is already saved.
    await notifyAdmin(product.name, product.slug, email).catch((e) =>
      console.error("[stock-notify]", e)
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stock-notify] error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
