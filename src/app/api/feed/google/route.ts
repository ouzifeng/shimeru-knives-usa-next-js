import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { storeConfig } from "../../../../../store.config";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const siteUrl = storeConfig.url.replace(/\/$/, "");
    const currency = storeConfig.currency.toUpperCase();

    // Fetch products and variations in parallel
    const [productsResult, variationsResult] = await Promise.all([
      admin
        .from("products")
        .select("id, price, regular_price, sale_price, on_sale, stock_status, type")
        .eq("status", "publish")
        .order("id", { ascending: true }),
      admin
        .from("product_variations")
        .select("id, product_id, price, regular_price, sale_price, on_sale, stock_status"),
    ]);

    if (productsResult.error) {
      console.error("Feed query error:", productsResult.error);
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const products = productsResult.data || [];
    const variations = variationsResult.data || [];

    // Group variations by parent
    const variationsByProduct = new Map<number, typeof variations>();
    for (const v of variations) {
      const existing = variationsByProduct.get(v.product_id) || [];
      existing.push(v);
      variationsByProduct.set(v.product_id, existing);
    }

    // Build feed items: id, availability, price, sale_price
    const items: { id: number; availability: string; price: number; salePrice: number | null }[] = [];

    for (const p of products) {
      const productVariations = variationsByProduct.get(p.id);

      if (p.type === "variable" && productVariations?.length) {
        for (const v of productVariations) {
          const regularPrice = v.on_sale && v.regular_price ? v.regular_price : v.price;
          const salePrice = v.on_sale && v.sale_price ? v.sale_price : null;
          items.push({
            id: v.id,
            availability: v.stock_status === "instock" ? "in_stock" : "out_of_stock",
            price: regularPrice,
            salePrice,
          });
        }
      } else {
        const regularPrice = p.on_sale && p.regular_price ? p.regular_price : p.price;
        const salePrice = p.on_sale && p.sale_price ? p.sale_price : null;
        items.push({
          id: p.id,
          availability: p.stock_status === "instock" ? "in_stock" : "out_of_stock",
          price: regularPrice,
          salePrice,
        });
      }
    }

    // Build XML — supplemental feed (id + price + availability only)
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
    xml += `<channel>\n`;
    xml += `<title>Shimeru Price &amp; Stock Feed</title>\n`;
    xml += `<link>${escapeXml(siteUrl)}</link>\n`;
    xml += `<description>Supplemental feed for price and availability updates</description>\n`;

    for (const item of items) {
      xml += `<item>\n`;
      xml += `<g:id>${item.id}</g:id>\n`;
      xml += `<g:availability>${item.availability}</g:availability>\n`;
      xml += `<g:price>${currency} ${item.price.toFixed(2)}</g:price>\n`;
      if (item.salePrice !== null) {
        xml += `<g:sale_price>${currency} ${item.salePrice.toFixed(2)}</g:sale_price>\n`;
      }
      xml += `</item>\n`;
    }

    xml += `</channel>\n`;
    xml += `</rss>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("Feed generation error:", err);
    return NextResponse.json({ error: "Feed generation failed" }, { status: 500 });
  }
}
