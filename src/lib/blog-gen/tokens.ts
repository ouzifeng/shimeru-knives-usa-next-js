import { getSupabase } from "@/lib/supabase";

// Render-time resolver for {{product:<id>}} tokens embedded in blog body_html.
// Generated posts store stable product IDs as tokens rather than baked HTML, so
// the price/photo/link resolve live from the products table at render (ISR), and
// the same token renders the UK price (£) here and the US price ($) on the US
// build via NEXT_PUBLIC_CURRENCY_SYMBOL. Existing posts contain no tokens and
// pass straight through. This must NEVER throw: on any failure it strips tokens
// rather than break the article.

const PRODUCT_TOKEN = /\{\{product:(\d+)\}\}/g;
const SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "£";

interface TokenProduct {
  id: number;
  name: string;
  slug: string;
  price: number | null;
  images: { src?: string }[] | null;
  stock_status: string | null;
}

export async function resolveBlogTokens(html: string): Promise<string> {
  if (!html || !html.includes("{{product:")) return html;
  try {
    const ids = [...new Set([...html.matchAll(PRODUCT_TOKEN)].map((m) => Number(m[1])))];
    if (ids.length === 0) return html;

    const { data } = await getSupabase()
      .from("products")
      .select("id,name,slug,price,images,stock_status")
      .in("id", ids);

    const byId = new Map<number, TokenProduct>((data as TokenProduct[] | null)?.map((p) => [p.id, p]) || []);

    return html.replace(PRODUCT_TOKEN, (_m, idStr) => {
      const p = byId.get(Number(idStr));
      return p ? productCard(p) : ""; // unknown/unpublished product: drop the token
    });
  } catch {
    return html.replace(PRODUCT_TOKEN, "");
  }
}

function productCard(p: TokenProduct): string {
  const img = Array.isArray(p.images) && p.images[0]?.src ? p.images[0].src : "";
  const price = p.price != null ? `${SYMBOL}${p.price}` : "";
  const sold = p.stock_status === "outofstock";
  return `<a href="/product/${p.slug}" style="display:flex;gap:16px;align-items:center;border:1px solid #e5e5e5;border-radius:10px;padding:14px;margin:20px 0;text-decoration:none;color:inherit">` +
    `<img src="${img}" alt="${escapeAttr(p.name)}" loading="lazy" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex:0 0 auto"/>` +
    `<span><strong style="display:block;font-size:16px;margin-bottom:2px">${escapeHtml(p.name)}</strong>` +
    `<span style="color:#111;font-weight:600">${price}${sold ? " · currently out of stock" : ""}</span>` +
    `<span style="display:block;font-size:13px;color:#777;margin-top:4px">View product &rarr;</span></span></a>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
