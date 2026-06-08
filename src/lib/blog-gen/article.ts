import { getSupabaseAdmin } from "@/lib/supabase";
import { deepseek, parseJson } from "./deepseek";
import {
  STATIC_LINK_ALLOWLIST, validateLinks, stripDashes, wordCount, bannedHits,
} from "./rules";

// Generate one grounded article from a queued title. Products are referenced by
// CLEAN numeric handles the model cannot corrupt; we remap them to stable
// product IDs for storage so the reader resolves live prices. Unsplash imagery
// is baked at publish (download endpoint pinged, photographer credited). US English.

export interface QueuedTitle {
  title: string;
  slug: string;
  target_keyword: string | null;
  secondary_keywords: string[] | null;
  intent: string;
  maps_to_category: string | null;
}

export interface GeneratedPost {
  slug: string;
  title: string;
  excerpt: string;
  body_html: string;
  meta_title: string;
  meta_description: string;
  featured_image_url: string | null;
  featured_image_alt: string;
  categories: string[];
}

interface Prod {
  id: number; name: string; slug: string; price: number | null;
  images: { src?: string }[] | null;
  spec: { blade_length?: string; steel_type?: string; handle_material?: string; best_for?: string };
}

async function featuredProducts(catSlug: string | null): Promise<Prod[]> {
  const admin = getSupabaseAdmin();
  let ids: number[] = [];
  if (catSlug) {
    const { data } = await admin.from("product_categories").select("product_id").eq("category_slug", catSlug);
    ids = (data || []).map((r) => r.product_id as number);
  }
  const base = admin.from("products").select("id,name,slug,price,images").eq("status", "publish").eq("stock_status", "instock");
  const { data: prods } = ids.length
    ? await base.in("id", ids).limit(6)
    : await base.order("units_sold_90d", { ascending: false, nullsFirst: false }).limit(6);

  let list = (prods || []) as Omit<Prod, "spec">[];
  if (list.length < 2) {
    const { data: top } = await admin
      .from("products").select("id,name,slug,price,images")
      .eq("status", "publish").eq("stock_status", "instock")
      .order("units_sold_90d", { ascending: false, nullsFirst: false }).limit(4);
    const seen = new Set(list.map((p) => p.id));
    for (const p of (top || []) as Omit<Prod, "spec">[]) if (!seen.has(p.id)) list.push(p);
  }
  list = list.slice(0, 4);

  const { data: specs } = await admin
    .from("product_specs")
    .select("product_id,blade_length,steel_type,handle_material,best_for")
    .in("product_id", list.map((p) => p.id));
  const specById = new Map((specs || []).map((s) => [s.product_id as number, s]));
  return list.map((p) => ({ ...p, spec: specById.get(p.id) || {} }));
}

async function unsplash(query: string): Promise<{ src: string; author: string; authorUrl: string } | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://api.unsplash.com/search/photos?per_page=1&orientation=landscape&query=${encodeURIComponent(query)}`, { headers: { Authorization: "Client-ID " + key } });
    const j = await r.json();
    const p = j.results?.[0];
    if (!p) return null;
    if (p.links?.download_location) fetch(p.links.download_location, { headers: { Authorization: "Client-ID " + key } }).catch(() => {});
    return { src: p.urls.regular, author: p.user.name, authorUrl: p.user.links.html };
  } catch {
    return null;
  }
}

export async function generateArticle(t: QueuedTitle): Promise<GeneratedPost> {
  const admin = getSupabaseAdmin();
  const products = await featuredProducts(t.maps_to_category);
  if (products.length < 2) throw new Error("not enough in-stock products to ground the article");

  const byHandle = new Map<string, Prod>(products.map((p, i) => [String(i + 1), p]));
  const productLines = [...byHandle.entries()].map(([h, p]) =>
    `${h}: ${p.name} — ${p.spec.blade_length || "?"}, ${p.spec.steel_type || "?"}, ${p.spec.handle_material || "?"} handle, best for ${p.spec.best_for || "everyday prep"}. Reference as {{product:${h}}}`
  ).join("\n");

  const { data: cats } = await admin.from("product_categories").select("category_slug");
  const categorySlugs = new Set((cats || []).map((c) => c.category_slug as string));
  const productSlugs = new Set(products.map((p) => p.slug));

  const allowedLinks = [
    "/product  (the full knife shop / all products)",
    ...(t.maps_to_category ? [`/product?category=${t.maps_to_category}  (this category)`] : []),
    "/knife-care  (knife care guide)",
    "/knife-guide  (how to choose a knife)",
  ].join("\n");

  const sys = "You are a senior writer for Shimeru Knives, a US shop selling Japanese kitchen knives. You write in US English in a calm, expert, honest tone, like a real US company that knows knives. You are NOT a dropshipper. You return ONLY valid JSON, no markdown fences, no commentary.";
  const user = `Write a blog article.

TITLE: ${t.title}
PRIMARY KEYWORD: ${t.target_keyword || t.title}
SECONDARY KEYWORDS: ${(t.secondary_keywords || []).join(", ")}
HARD LENGTH REQUIREMENT: 1400 to 1600 words. Below 1300 is a failure.

PRODUCTS YOU MUST FEATURE — reference each by its TOKEN exactly (e.g. {{product:1}}). NEVER type a slug, price or the specs as plain text; the token renders a live card with the current price and photo:
${productLines}

ALLOWED INTERNAL LINKS — link ONLY to these exact paths (plus the product tokens). Do NOT invent any other path such as /shop or /collections:
${allowedLinks}

STRICT RULES (output rejected if any fail):
1. US English spelling.
2. NO em dashes and NO en dashes anywhere. Use commas, colons or periods only.
3. Reference at least 2 product tokens, placed naturally at decision points.
4. At least 2 inline links from the allowed list above.
5. Do NOT invent specs, prices, test results, awards, ratings or chef endorsements. Use only the specs given.
6. Banned phrases: "that said", "the good news is", "it is worth saying", "in conclusion", "when it comes to", "look no further", "elevate your".
7. Use <h2> for every section heading. That is the main heading style across the blog. Use <h3> sparingly and only for a genuine nested sub-point, never as your default. Use <p> paragraphs and at most one <ul>.
8. Helpful and honest, not salesy.
9. The meta_title must NOT contain the shop name or any "| Brand" suffix.
10. Put a {{unsplash:QUERY}} token at the very top as the hero, and one more mid-article (QUERY is a short photo search).

Return JSON exactly:
{ "title": "...", "meta_title": "...", "meta_description": "...", "excerpt": "...", "body_html": "..." }
body_html is the inner HTML, starting with the hero {{unsplash:...}} token.`;

  const messages = [
    { role: "system" as const, content: sys },
    { role: "user" as const, content: user },
  ];
  let post = parseJson<Record<string, string>>(await deepseek(messages));

  let wc = wordCount(post.body_html || "");
  let attempts = 0;
  while (wc < 1300 && attempts < 2) {
    attempts++;
    const expand = [
      ...messages,
      { role: "assistant" as const, content: JSON.stringify(post) },
      { role: "user" as const, content: `That was only ${wc} words. Expand to 1400 to 1600 words. Keep ALL existing product tokens, links, headings and the US style. Add genuine depth (technique, size and steel comparisons, care, who each knife suits). Do not pad. Return the SAME JSON shape.` },
    ];
    post = parseJson<Record<string, string>>(await deepseek(expand));
    wc = wordCount(post.body_html || "");
  }

  let body = post.body_html || "";

  body = validateLinks(body, { staticOk: STATIC_LINK_ALLOWLIST, categorySlugs, productSlugs }).html;

  const handles = [...new Set([...body.matchAll(/\{\{product:(\d+)\}\}/g)].map((m) => m[1]))];
  const validHandles = handles.filter((h) => byHandle.has(h));
  if (validHandles.length < 2) throw new Error("fewer than 2 valid product references after generation");
  for (const h of validHandles) {
    const p = byHandle.get(h)!;
    body = body.split(`{{product:${h}}}`).join(`{{product:${p.id}}}`);
  }
  body = body.replace(/\{\{product:\d+\}\}/g, (m) => {
    const id = m.match(/\d+/)![0];
    return products.some((p) => p.id === Number(id)) ? m : "";
  });

  const uTokens = [...body.matchAll(/\{\{unsplash:([^}]+)\}\}/g)].map((m) => m[1]);
  let featured_image_url: string | null = null;
  const credits: string[] = [];
  if (uTokens[0]) {
    const hero = await unsplash(uTokens[0]);
    if (hero) { featured_image_url = hero.src; credits.push(`<a href="${hero.authorUrl}" rel="nofollow">${hero.author}</a>`); }
    body = body.split(`{{unsplash:${uTokens[0]}}}`).join("");
  }
  for (const q of uTokens.slice(1)) {
    const im = await unsplash(q);
    const fig = im
      ? `<figure><img src="${im.src}" alt="${q}" loading="lazy" style="width:100%;border-radius:8px"/><figcaption style="font-size:12px;color:#888;margin-top:6px">Photo by <a href="${im.authorUrl}" rel="nofollow">${im.author}</a> on Unsplash</figcaption></figure>`
      : "";
    body = body.split(`{{unsplash:${q}}}`).join(fig);
  }
  if (credits.length) {
    body += `<p style="font-size:12px;color:#999;margin-top:32px">Photography: ${credits.join(", ")} via Unsplash.</p>`;
  }

  body = stripDashes(body);
  const metaTitle = stripDashes((post.meta_title || post.title || t.title).replace(/\s*[|·-]\s*Shimeru Knives.*$/i, "").trim());
  const metaDesc = stripDashes(post.meta_description || "").slice(0, 320);
  const excerpt = stripDashes(post.excerpt || post.meta_description || "").slice(0, 320);
  const title = stripDashes(post.title || t.title);

  // Strip any unresolved Unsplash token. Product tokens are intentional: they
  // stay in the stored body and resolve to live cards at render time.
  body = body.replace(/\{\{unsplash:[^{}]*\}\}/g, "");
  const banned = bannedHits(body);
  if (banned.length) throw new Error("banned phrases present: " + banned.join(", "));

  return {
    slug: t.slug,
    title,
    excerpt,
    body_html: body,
    meta_title: metaTitle,
    meta_description: metaDesc,
    featured_image_url,
    featured_image_alt: title,
    categories: t.intent === "commercial" ? ["Buying Guides"] : ["Japanese Knives"],
  };
}
