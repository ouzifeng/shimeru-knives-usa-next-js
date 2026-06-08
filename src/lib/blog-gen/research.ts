import { GoogleAdsApi, enums } from "google-ads-api";
import { getSupabaseAdmin } from "@/lib/supabase";

// Harvest real search demand from Google Ads Keyword Planner, clean out junk and
// competitor brands, dedupe against everything already written or queued, and
// rank. Commercial topics (mapping to a stocked category) are boosted.

export interface KeywordRow {
  kw: string;
  vol: number;
  comp: "LOW" | "MED" | "HIGH" | "-";
  cat: string | null;
  score: number;
}

// Geo + language are overridable so the US build can pass its own.
const GEO = process.env.BLOG_GEO_TARGET || "geoTargetConstants/2826"; // UK
const LANG = "languageConstants/1000"; // English

const INFO_SEEDS = [
  "knife sharpening", "whetstone sharpening", "how to sharpen a kitchen knife",
  "japanese knife care", "honing a knife", "best cutting board", "carbon steel knife",
  "knife skills", "gyuto vs santoku", "japanese vs western knives", "deba knife",
  "yanagiba knife", "sujihiki knife", "how to cut vegetables", "japanese knife handle",
];

const RELEVANT = /\b(knife|knives|gyuto|santoku|nakiri|kiritsuke|cleaver|bunka|petty|deba|yanagiba|sujihiki|usuba|blade|sharpen|whetstone|honing|hone|kitchen|chef|cook|cooking|culinary|damascus|steel|cutting board|chopping board|sushi|sashimi|carving|paring|bread knife|steak knife|knife set)\b/i;
const COMPETITOR = /\b(victorinox|w[uü]sthof|zwilling|henckels|global|dalstrong|cuisinart|ninja|kitchenaid|tefal|sabatier|ikea|amazon|aldi|argos|tesco|wilko|mercer|farberware|cangshan|hexclad|tojiro|shapton|king|procook|mosfiata|shun|miyabi|made in)\b/i;
const JUNK = /\b(sudoku|sodoku|knife game|throwing knife|pocket knife|hunting knife|swiss army|butterfly knife)\b/i;

const STOPWORDS = new Set("a an the to for of in on with your you how what is are best vs and or my me this that it good top guide".split(" "));
function tokens(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOPWORDS.has(t));
}
function coreKey(s: string): string {
  return tokens(s).sort().join(" ");
}

function adsCustomer() {
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });
  return client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
  });
}

function compLabel(m: { competition?: unknown; competition_index?: number }): KeywordRow["comp"] {
  const c = m?.competition;
  const map: Record<string, KeywordRow["comp"]> = { "2": "LOW", "3": "MED", "4": "HIGH", LOW: "LOW", MEDIUM: "MED", HIGH: "HIGH" };
  if (map[String(c)]) return map[String(c)];
  if (typeof m?.competition_index === "number") {
    return m.competition_index < 34 ? "LOW" : m.competition_index < 67 ? "MED" : "HIGH";
  }
  return "-";
}

async function generateIdeas(customer: ReturnType<typeof adsCustomer>, seeds: string[]) {
  const out: { kw: string; vol: number; comp: KeywordRow["comp"] }[] = [];
  for (let i = 0; i < seeds.length; i += 10) {
    const batch = seeds.slice(i, i + 10);
    // The typed client demands a fuller request shape than the API needs at
    // runtime, and types the response as non-iterable though it returns an array.
    const res = (await customer.keywordPlanIdeas.generateKeywordIdeas({
      customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
      language: LANG,
      geo_target_constants: [GEO],
      keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
      keyword_seed: { keywords: batch },
    } as Parameters<typeof customer.keywordPlanIdeas.generateKeywordIdeas>[0])) as unknown as Array<{
      text?: string;
      keyword_idea_metrics?: { avg_monthly_searches?: number; competition?: unknown; competition_index?: number };
    }>;
    for (const r of res) {
      out.push({
        kw: r.text || "",
        vol: Number(r.keyword_idea_metrics?.avg_monthly_searches || 0),
        comp: compLabel(r.keyword_idea_metrics || {}),
      });
    }
  }
  return out;
}

export async function harvestKeywords(): Promise<KeywordRow[]> {
  const admin = getSupabaseAdmin();

  // Seeds: stocked category names (commercial) + fixed informational set.
  const { data: cats } = await admin.from("product_categories").select("category_name,category_slug");
  const catNames = [...new Set((cats || []).map((c) => (c.category_name as string)))];
  const catSlugSet = new Set((cats || []).map((c) => (c.category_slug as string)));
  const commercialSeeds = catNames.map((n) => `${n.toLowerCase()} knife`);

  // Already covered: existing posts AND everything in the title queue.
  const [{ data: posts }, { data: queued }] = await Promise.all([
    admin.from("blog_posts").select("title").limit(5000),
    admin.from("blog_titles").select("title,slug").limit(5000),
  ]);
  const coveredKeys = new Set<string>([
    ...(posts || []).map((p) => coreKey(p.title as string)),
    ...(queued || []).map((q) => coreKey(q.title as string)),
  ]);
  const coveredTokenSets = [
    ...(posts || []).map((p) => new Set(tokens(p.title as string))),
    ...(queued || []).map((q) => new Set(tokens(q.title as string))),
  ];

  const customer = adsCustomer();
  const raw = [...(await generateIdeas(customer, commercialSeeds)), ...(await generateIdeas(customer, INFO_SEEDS))];

  // Aggregate by keyword, keep max volume.
  const byKw = new Map<string, { kw: string; vol: number; comp: KeywordRow["comp"] }>();
  for (const r of raw) {
    const ex = byKw.get(r.kw);
    if (!ex || r.vol > ex.vol) byKw.set(r.kw, r);
  }

  const cleaned = [...byKw.values()].filter(
    (r) => RELEVANT.test(r.kw) && !COMPETITOR.test(r.kw) && !JUNK.test(r.kw) && r.vol >= 30
  );

  function covered(kw: string): boolean {
    if (coveredKeys.has(coreKey(kw))) return true;
    const kt = tokens(kw);
    if (kt.length < 2) return true;
    for (const set of coveredTokenSets) {
      let hit = 0;
      for (const t of kt) if (set.has(t)) hit++;
      if (hit / kt.length >= 0.8) return true;
    }
    return false;
  }

  function commercialCat(kw: string): string | null {
    const kt = new Set(tokens(kw));
    for (const slug of catSlugSet) {
      if (slug.split("-").every((t) => kt.has(t))) return slug;
    }
    return null;
  }

  const fresh = cleaned
    .filter((r) => !covered(r.kw))
    .map((r) => {
      const cat = commercialCat(r.kw);
      return { ...r, cat, score: Math.round(r.vol * (cat ? 1.5 : 1)) };
    })
    .sort((a, b) => b.score - a.score);

  return fresh;
}
