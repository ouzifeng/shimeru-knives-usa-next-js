import { NextRequest, NextResponse } from "next/server";
import Fuse from "fuse.js";
import { supabase } from "@/lib/supabase";
import { decodeEntities } from "@/lib/format";

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
const PRODUCT_FIELDS = "id, name, slug, sku, price, sale_price, on_sale, images, stock_status";

function decodeName<T extends { name?: string | null }>(r: T): T {
  return r?.name ? { ...r, name: decodeEntities(r.name) } : r;
}

// Levenshtein edit distance between two short strings.
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

// Count shared leading characters ("toch" vs "tokachi" -> 2).
function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Plain-English -> canonical search term. Customers search by the job ("I want
// to peel/chop veg/carve") in words that never appear in the catalogue, which
// dead-ended before. Each alias maps to a term that DOES match a product or a
// knife inside the sets. Seeded from real zero-result search logs; longest
// alias wins so "vegetable knife" resolves before "vegetable".
const SEARCH_SYNONYMS: Record<string, string> = {
  // veg prep -> nakiri
  "vegetable knife": "nakiri",
  "veg knife": "nakiri",
  vegetable: "nakiri",
  // small precision knives -> petty / fruit knife (included in every set)
  "peeling knife": "petty",
  peeling: "petty",
  "paring knife": "petty",
  paring: "petty",
  // serrated -> bread
  "pastry knife": "bread",
  pastry: "bread",
  // slicing/carving large cuts -> gyuto (the Japanese carving/slicing knife)
  "carving knife": "gyuto",
  carving: "gyuto",
  "slicing knife": "gyuto",
  // fish -> the filleting/boning knife inside the sets
  "fish knife": "filleting",
  "fillet knife": "filleting",
};

// Resolve a query to its canonical term, or null if no synonym applies.
// Matches the whole query, or a contained alias (longest first).
function resolveSynonym(q: string): string | null {
  const norm = q.toLowerCase().trim();
  if (SEARCH_SYNONYMS[norm]) return SEARCH_SYNONYMS[norm];
  const aliases = Object.keys(SEARCH_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (norm.includes(alias)) return SEARCH_SYNONYMS[alias];
  }
  return null;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("q")?.trim();
  if (!raw || raw.length < 3) {
    return NextResponse.json({ results: [], categories: [] });
  }

  // Rewrite plain-English intent ("vegetable knife") to the catalogue term
  // ("nakiri") before searching. `synonym` is surfaced so the UI can show
  // "Showing results for nakiri".
  const synonym = resolveSynonym(raw);
  const q = synonym ?? raw;

  // Search categories
  const { data: catData } = await supabase
    .from("product_categories")
    .select("category_slug, category_name")
    .ilike("category_name", `%${q}%`);

  // Deduplicate categories
  const catMap = new Map<string, string>();
  catData?.forEach((r) => catMap.set(r.category_slug, r.category_name));
  const categories = Array.from(catMap.entries())
    .slice(0, 3)
    .map(([slug, name]) => ({ slug, name: decodeEntities(name) }));

  // Search products in parallel:
  //  - name/short_description FTS (the stored `fts` column)
  //  - SKU substring
  //  - full description FTS (multi-word, stemmed)
  //  - full description substring (catches set contents written with slashes
  //    like "Boning/Filleting knife", which FTS tokenises badly)
  // The 8-piece sets list every knife they contain in the description only, so
  // searches like "fillet"/"boning"/"petty" should surface the sets rather
  // than dead-ending.
  const escapedQ = q.replace(/[%,]/g, "");
  const [ftsRes, skuRes, descFtsRes, descLikeRes] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("status", "publish")
      .textSearch("fts", q, { type: "websearch" })
      .limit(6),
    supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("status", "publish")
      .ilike("sku", `%${escapedQ}%`)
      .limit(6),
    supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("status", "publish")
      .textSearch("description", q, { type: "websearch" })
      .limit(6),
    supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("status", "publish")
      .ilike("description", `%${escapedQ}%`)
      .limit(6),
  ]);

  // Name and SKU matches first (most precise). Then a literal substring hit in
  // the description (e.g. a set that lists "Filleting knife" in its contents)
  // ahead of a stemmed prose mention (a gyuto whose copy happens to say
  // "filleting"), since the substring is the tighter signal.
  const merged = [
    ...(skuRes.data || []),
    ...(ftsRes.data || []),
    ...(descLikeRes.data || []),
    ...(descFtsRes.data || []),
  ];
  const seen = new Set<number>();
  const deduped = merged.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));

  if (deduped.length) {
    return NextResponse.json(
      { results: deduped.slice(0, 6).map(decodeName), categories, ...(synonym ? { synonym } : {}) },
      { headers: CACHE_HEADERS }
    );
  }

  // Fallback to ilike on name + sku if both primary paths returned nothing
  const { data: fallback } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("status", "publish")
    .or(`name.ilike.%${escapedQ}%,sku.ilike.%${escapedQ}%`)
    .limit(6);

  if (fallback && fallback.length) {
    return NextResponse.json({ results: fallback.map(decodeName), categories }, { headers: CACHE_HEADERS });
  }

  // Last resort: typo-tolerant fuzzy match. Exact, FTS and substring all came
  // back empty, so the customer likely misspelled an unfamiliar Japanese name
  // ("tocha" for Tokachi, "damascas" for Damascus). Load the small catalogue
  // and fuzzy-match in memory; flag the response so the UI can say "did you
  // mean". Only runs on otherwise-zero searches, so it can't worsen good ones.
  const { data: pool } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("status", "publish");

  if (pool && pool.length) {
    // The distinguishing word is the knife's name at the start ("Tokachi",
    // "Dark Grain"), not the generic suffix ("8.5\" Gyuto Chef Knife").
    const enriched = pool.map((p) => ({
      ...p,
      model: (p.name || "").trim().split(/\s+/)[0],
    }));
    const ql = q.toLowerCase();

    // 1) Prefix-distance match on the knife name. This is what reliably maps a
    // misspelled name to the right knife ("toch"/"yamto"/"misuz"): Fuse's
    // substring matching can't tell "toch" -> Tokachi from "toch" -> Bu-tch-er,
    // but the query shares the knife name's leading letters and is a small edit
    // away from its prefix.
    const maxEdits = ql.length <= 4 ? 2 : Math.floor(ql.length / 2);
    const prefixHits = enriched
      .map((p) => {
        const model = (p.model || "").toLowerCase();
        return { item: p, pre: commonPrefix(ql, model), dist: editDistance(ql, model.slice(0, ql.length)) };
      })
      .filter((x) => x.pre >= 2 && x.dist <= maxEdits)
      .sort((a, b) => b.pre - a.pre || a.dist - b.dist)
      .map((x) => x.item);

    // 2) Fuse for broader typo tolerance (misspelled attributes like
    // "damascas", or typos away from the start of the name).
    const fuse = new Fuse(enriched, {
      keys: [
        { name: "model", weight: 3 },
        { name: "name", weight: 1 },
        { name: "sku", weight: 1 },
      ],
      threshold: 0.5,
      ignoreLocation: true,
      minMatchCharLength: 3,
    });
    const fuseHits = fuse.search(q).map((r) => r.item);

    // Prefix-name matches first (highest intent), then Fuse breadth, deduped.
    const picked: typeof enriched = [];
    const seenSku = new Set<string>();
    for (const it of [...prefixHits, ...fuseHits]) {
      if (seenSku.has(it.sku)) continue;
      seenSku.add(it.sku);
      picked.push(it);
      if (picked.length >= 4) break;
    }

    if (picked.length) {
      return NextResponse.json(
        { results: picked.map(decodeName), categories, fuzzy: true },
        { headers: CACHE_HEADERS }
      );
    }
  }

  return NextResponse.json({ results: [], categories }, { headers: CACHE_HEADERS });
}
