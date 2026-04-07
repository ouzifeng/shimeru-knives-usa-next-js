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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Category slugs to exclude from the feed (non-knife products)
const EXCLUDED_CATEGORY_SLUGS = new Set(["sharpener"]);

function isExcluded(categories: { slug: string }[]): boolean {
  return categories.some((c) => EXCLUDED_CATEGORY_SLUGS.has(c.slug));
}

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const siteUrl = storeConfig.url.replace(/\/$/, "");
    const currency = storeConfig.currency.toUpperCase();
    const brand = "Shimeru Knives";

    // Fetch products and variations in parallel
    const [productsResult, variationsResult] = await Promise.all([
      admin
        .from("products")
        .select(
          "id, name, slug, sku, description, short_description, price, regular_price, sale_price, on_sale, stock_status, type, images, categories"
        )
        .eq("status", "publish")
        .order("id", { ascending: true }),
      admin
        .from("product_variations")
        .select(
          "id, product_id, sku, price, regular_price, sale_price, on_sale, stock_status, attributes, image"
        ),
    ]);

    if (productsResult.error) {
      console.error("TikTok feed query error:", productsResult.error);
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const products = productsResult.data || [];
    const variations = variationsResult.data || [];

    // Group variations by parent
    const variationsByProduct = new Map<number, (typeof variations)>();
    for (const v of variations) {
      const existing = variationsByProduct.get(v.product_id) || [];
      existing.push(v);
      variationsByProduct.set(v.product_id, existing);
    }

    // Build XML feed — TikTok catalog format
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
    xml += `<channel>\n`;
    xml += `<title>${escapeXml(brand)} Product Catalog</title>\n`;
    xml += `<link>${escapeXml(siteUrl)}</link>\n`;
    xml += `<description>TikTok product catalog for ${escapeXml(brand)}</description>\n`;

    for (const p of products) {
      if (isExcluded(p.categories || [])) continue;

      const productVariations = variationsByProduct.get(p.id);
      const description = stripHtml(p.short_description || p.description || p.name);
      const productUrl = `${siteUrl}/product/${p.slug}`;
      const mainImage = p.images?.[0]?.src || "";
      const additionalImages = (p.images || []).slice(1, 10).map((img: { src: string }) => img.src);
      const category = p.categories?.[0]?.name || "Kitchen Knives";

      if (p.type === "variable" && productVariations?.length) {
        for (const v of productVariations) {
          const optionLabel = v.attributes?.[0]?.option || "";
          const title = optionLabel ? `${p.name} — ${optionLabel}` : p.name;
          const regularPrice = v.on_sale && v.regular_price ? v.regular_price : v.price;
          const salePrice = v.on_sale && v.sale_price ? v.sale_price : null;
          const varImage = v.image?.src || mainImage;

          xml += `<item>\n`;
          xml += `<g:id>${v.id}</g:id>\n`;
          xml += `<g:item_group_id>${p.id}</g:item_group_id>\n`;
          xml += `<g:title>${escapeXml(title)}</g:title>\n`;
          xml += `<g:description>${escapeXml(description)}</g:description>\n`;
          xml += `<g:availability>${v.stock_status === "instock" ? "in stock" : "out of stock"}</g:availability>\n`;
          xml += `<g:condition>new</g:condition>\n`;
          xml += `<g:price>${regularPrice.toFixed(2)} ${currency}</g:price>\n`;
          if (salePrice !== null) {
            xml += `<g:sale_price>${salePrice.toFixed(2)} ${currency}</g:sale_price>\n`;
          }
          xml += `<g:link>${escapeXml(productUrl)}</g:link>\n`;
          xml += `<g:image_link>${escapeXml(varImage)}</g:image_link>\n`;
          for (const img of additionalImages) {
            xml += `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>\n`;
          }
          xml += `<g:brand>${escapeXml(brand)}</g:brand>\n`;
          xml += `<g:google_product_category>Kitchen Knives</g:google_product_category>\n`;
          xml += `<g:product_type>${escapeXml(category)}</g:product_type>\n`;
          if (v.sku) xml += `<g:mpn>${escapeXml(v.sku)}</g:mpn>\n`;
          xml += `</item>\n`;
        }
      } else {
        const regularPrice = p.on_sale && p.regular_price ? p.regular_price : p.price;
        const salePrice = p.on_sale && p.sale_price ? p.sale_price : null;

        xml += `<item>\n`;
        xml += `<g:id>${p.id}</g:id>\n`;
        xml += `<g:title>${escapeXml(p.name)}</g:title>\n`;
        xml += `<g:description>${escapeXml(description)}</g:description>\n`;
        xml += `<g:availability>${p.stock_status === "instock" ? "in stock" : "out of stock"}</g:availability>\n`;
        xml += `<g:condition>new</g:condition>\n`;
        xml += `<g:price>${regularPrice.toFixed(2)} ${currency}</g:price>\n`;
        if (salePrice !== null) {
          xml += `<g:sale_price>${salePrice.toFixed(2)} ${currency}</g:sale_price>\n`;
        }
        xml += `<g:link>${escapeXml(productUrl)}</g:link>\n`;
        xml += `<g:image_link>${escapeXml(mainImage)}</g:image_link>\n`;
        for (const img of additionalImages) {
          xml += `<g:additional_image_link>${escapeXml(img)}</g:additional_image_link>\n`;
        }
        xml += `<g:brand>${escapeXml(brand)}</g:brand>\n`;
        xml += `<g:google_product_category>Kitchen Knives</g:google_product_category>\n`;
        xml += `<g:product_type>${escapeXml(category)}</g:product_type>\n`;
        if (p.sku) xml += `<g:mpn>${escapeXml(p.sku)}</g:mpn>\n`;
        xml += `</item>\n`;
      }
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
    console.error("TikTok feed generation error:", err);
    return NextResponse.json({ error: "Feed generation failed" }, { status: 500 });
  }
}
