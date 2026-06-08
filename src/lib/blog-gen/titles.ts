import { getSupabaseAdmin } from "@/lib/supabase";
import { deepseek, parseJson } from "./deepseek";
import { harvestKeywords } from "./research";
import { hasDashes } from "./rules";

// Collapse the harvested keyword synonyms into DISTINCT article topics, under
// strict title rules, then insert the survivors into the blog_titles ledger
// (deduped against everything already there). US English.

export interface TopicTitle {
  title: string;
  slug: string;
  primary_keyword: string;
  secondary_keywords: string[];
  intent: "commercial" | "informational";
  est_volume: number;
  maps_to_category: string | null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export async function countUnusedTitles(): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("blog_titles")
    .select("id", { count: "exact", head: true })
    .eq("status", "unused");
  return count || 0;
}

export async function refillQueue(batchId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const keywords = await harvestKeywords();
  if (keywords.length === 0) return 0;

  const { data: existing } = await admin.from("blog_posts").select("title").limit(5000);
  const existingTitles = (existing || []).map((p) => p.title as string);

  const candidates = keywords.slice(0, 130);
  const sys =
    "You are an SEO editor for Shimeru Knives, a US shop selling Japanese kitchen knives. You return ONLY valid JSON. No markdown, no code fences, no commentary.";
  const user = `Turn this keyword list into DISTINCT blog article topics. Many keywords are synonyms of the same article: collapse them into one topic each (every "wet stone sharpening" variant is ONE topic, every "best cutting board" variant is ONE topic).

But do NOT over-merge: long-tail and use-case specifics are each their own distinct topic (e.g. "best gyuto for beginners", "how to sharpen a santoku", "nakiri vs santoku", "japanese knife block"). Mine the long tail.

STRICT TITLE RULES (reject your own output if any fail):
1. US English spelling.
2. 45 to 65 characters.
3. NO em dashes and NO en dashes. Use commas, colons or periods only.
4. NO competitor brand names.
5. Keep Japanese knife terms exact: Gyuto, Santoku, Nakiri, Kiritsuke, Bunka, Petty, Deba, Yanagiba, Sujihiki.
6. No clickbait, no fabricated years, no "Ultimate Guide" or "Everything You Need to Know" cliches.
7. Each title unique versus every other title AND must not duplicate or overlap any EXISTING title below.
8. Match the search intent (a "best X" query wants a buying guide; a "how to" query wants a how-to).

For each topic return: "title", "primary_keyword", "secondary_keywords" (array), "intent" ("commercial"|"informational"), "est_volume" (integer), "maps_to_category" (the stocked category slug if commercial, else null).
Return JSON exactly: { "topics": [ ... ] } sorted by est_volume descending.

EXISTING TITLES (do not duplicate or overlap):
${existingTitles.map((t) => "- " + t).join("\n")}

CANDIDATE KEYWORDS (keyword | monthly searches | category):
${candidates.map((k) => `${k.kw} | ${k.vol} | ${k.cat || ""}`).join("\n")}`;

  // Bulk clustering uses deepseek-chat (reliable JSON, no reasoning blow-up).
  const content = await deepseek(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { model: "deepseek-chat", maxTokens: 8000 }
  );
  const parsed = parseJson<{ topics: TopicTitle[] }>(content);
  const topics = (parsed.topics || []).filter((t) => t.title && !hasDashes(t.title));

  const { data: existingSlugs } = await admin.from("blog_titles").select("slug").limit(10000);
  const taken = new Set((existingSlugs || []).map((r) => r.slug as string));

  const rows = [];
  for (const t of topics) {
    const slug = t.slug ? slugify(t.slug) : slugify(t.title);
    if (taken.has(slug)) continue;
    taken.add(slug);
    rows.push({
      title: t.title.trim(),
      slug,
      target_keyword: t.primary_keyword || null,
      search_volume: Number(t.est_volume) || 0,
      intent: t.intent === "commercial" ? "commercial" : "informational",
      angle: null,
      maps_to_category: t.maps_to_category || null,
      secondary_keywords: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [],
      status: "unused",
      batch_id: batchId,
    });
  }
  if (rows.length === 0) return 0;

  const { error } = await admin.from("blog_titles").insert(rows);
  if (error) throw new Error("blog_titles insert failed: " + error.message);
  return rows.length;
}
