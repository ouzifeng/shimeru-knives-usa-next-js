import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { wcFetch } from "@/lib/woocommerce";

const ENGLISH_FIRST_NAMES = [
  "James", "Sarah", "Tom", "Emma", "Dave", "Lucy", "Mark", "Claire",
  "Chris", "Rachel", "Dan", "Sophie", "Matt", "Hannah", "Rob", "Kate",
  "Ben", "Laura", "Jack", "Amy", "Paul", "Jen", "Mike", "Becky",
  "Steve", "Nicky", "Pete", "Zoe", "Andy", "Fiona", "Will", "Helen",
  "Sam", "Gemma", "Ian", "Vicky", "Neil", "Kirsty", "Gary", "Liz",
  "Phil", "Donna", "Lee", "Jo", "Simon", "Mel", "Tim", "Tina",
  "Stuart", "Karen", "Kev", "Holly", "Rich", "Steph", "Ade", "Chloe",
  "Greg", "Abby", "Wayne", "Nat", "Scott", "Ellie", "Ryan", "Beth",
  "Craig", "Megan", "Darren", "Lisa", "Carl", "Jade", "Tony", "Charlotte",
  "Shaun", "Leanne", "Russ", "Kelly", "Gavin", "Hayley", "Dean", "Nicola",
  "Ash", "Jess", "Ollie", "Rosie", "Harry", "Molly", "Freddie", "Georgia",
  "Liam", "Erin", "Josh", "Isla", "Callum", "Freya", "Connor", "Emily",
  "Rhys", "Alice", "Lewis", "Daisy", "Owen", "Millie", "Alfie", "Poppy",
  "Charlie", "Evie", "George", "Grace", "Ethan", "Ruby", "Archie", "Lily",
  "Joe", "Maisie", "Kieran", "Olivia", "Nathan", "Phoebe", "Toby", "Amber",
  "Bradley", "Heather", "Ross", "Alison", "Stu", "Carla", "Kris", "Bex",
  "Ed", "Tash", "Daz", "Soph", "Gaz", "Rach", "Col", "Nic",
];

const ENGLISH_LAST_NAMES = [
  "Smith", "Jones", "Taylor", "Brown", "Wilson", "Davies", "Evans",
  "Thomas", "Johnson", "Roberts", "Walker", "Wright", "Robinson",
  "Thompson", "White", "Hughes", "Edwards", "Green", "Hall", "Lewis",
  "Harris", "Clark", "Patel", "Jackson", "Wood", "Turner", "Martin",
  "Cooper", "Hill", "Ward", "Morris", "Moore", "King", "Watson",
  "Harrison", "Morgan", "Baker", "Young", "Allen", "Mitchell",
  "Campbell", "Stewart", "Murray", "Cox", "Bell", "Palmer", "James",
  "Kelly", "Bennett", "Gray", "Brooks", "Mason", "Griffin", "Russell",
  "Rose", "Fox", "Dixon", "Hunt", "Chapman", "Powell", "Perry",
  "Butler", "Barnes", "Fisher", "Knight", "Stevens", "Jenkins", "Shaw",
  "Pearce", "Cole", "Watts", "Hart", "Barker", "Grant", "Day",
  "Spencer", "Lynch", "Burke", "Booth", "Carr", "Marsh", "Dunn",
];

function randomName(): string {
  const first = ENGLISH_FIRST_NAMES[Math.floor(Math.random() * ENGLISH_FIRST_NAMES.length)];
  const last = ENGLISH_LAST_NAMES[Math.floor(Math.random() * ENGLISH_LAST_NAMES.length)];
  // Sometimes just first name, sometimes full name, sometimes first + initial
  const r = Math.random();
  if (r < 0.3) return first;
  if (r < 0.5) return `${first} ${last.charAt(0)}.`;
  return `${first} ${last}`;
}

function pickRating(): number {
  const r = Math.random();
  if (r < 0.60) return 5;
  if (r < 0.90) return 4;
  return 3;
}

function randomDate(from: string, to: string): string {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const d = new Date(start + Math.floor(Math.random() * (end - start)));
  return d.toISOString();
}

type ProductType = "knife-set" | "accessory" | "single-knife";

function detectProductType(product: any): ProductType {
  const name = (product.name || "").toLowerCase();
  const desc = ((product.short_description || "") + " " + (product.description || "")).toLowerCase();
  const text = name + " " + desc;

  // Check for sets first
  if (/\bset\b|\bkit\b|\bcollection\b|\b\d+\s*(piece|pc|knife|knives)\b/.test(name) ||
    /\bset of\b|\bknife set\b/.test(desc)) {
    return "knife-set";
  }

  // Check for non-knife accessories
  if (/\bsharpener\b|\bsharpening\b|\bwhetstone\b|\bhoning\b|\bsteel\b.*\brod\b|\bstrop\b|\bblock\b|\bboard\b|\bcutting board\b|\bknife roll\b|\bknife bag\b|\bmagnetic\b.*\bstrip\b|\bknife stand\b|\bknife holder\b/.test(text)) {
    return "accessory";
  }

  return "single-knife";
}

function buildPrompt(product: any, ratingBreakdown: { rating: number; count: number }[], attributes: string): string {
  const plainDesc = (product.short_description || product.description || "")
    .replace(/<[^>]*>/g, "")
    .slice(0, 600);

  const categories = (product.categories as any[])?.map((c: any) => c.name).join(", ") || "";
  const productType = detectProductType(product);
  const totalCount = ratingBreakdown.reduce((sum, b) => sum + b.count, 0);

  const ratingInstructions = ratingBreakdown
    .filter((b) => b.count > 0)
    .map((b) => {
      if (b.rating === 5) return `- ${b.count} reviews rated 5 stars: Enthusiastic, genuinely impressed. These customers love the product.`;
      if (b.rating === 4) return `- ${b.count} reviews rated 4 stars: Positive overall but with a minor gripe or "wish" — e.g. handle shape preference, slightly heavier than expected, wish it came in a different size. Still clearly recommends.`;
      return `- ${b.count} reviews rated 3 stars: Mixed feelings. Decent product but not blown away — maybe expected more for the price, or found it good but not great. Noticeably less enthusiastic than 4-5 star reviews.`;
    })
    .join("\n");

  const productTypeGuidance = productType === "knife-set"
    ? `THIS IS A KNIFE SET (multiple knives). CRITICAL: Reviews MUST talk about "the set", "these knives", "the collection", etc. — NEVER "this knife" singular. Reviewers should mention using different knives from the set for different tasks, which knife in the set they use most, how the set covers their kitchen needs, gift value of a complete set, etc.`
    : productType === "accessory"
    ? `THIS IS NOT A KNIFE — it is a kitchen accessory/tool (${product.name}). CRITICAL: Reviews MUST talk about this specific product and what it does. NEVER say "this knife" or review it as if it were a knife. Talk about using it to maintain/sharpen knives, the build quality, ease of use, results it gives, etc. The review must clearly be about THIS product, not about a knife.`
    : `This is a single knife. Reviews should talk about "this knife", "the blade", etc.`;

  return `You are generating fake product reviews that must sound EXACTLY like real customers wrote them. These are for a US-based Japanese kitchen knife shop.

PRODUCT:
- Name: ${product.name}
- Price: $${product.price}
- Categories: ${categories}
- Attributes: ${attributes || "None listed"}
- Description: ${plainDesc}

${productTypeGuidance}

RATING BREAKDOWN — generate reviews matching these star ratings in order:
${ratingInstructions}

Generate EXACTLY ${totalCount} reviews as a JSON array of objects: [{"rating": 5, "text": "..."}, ...]. Output them in the order above (all 5-star first, then 4-star, then 3-star). The "text" is JUST the review body (no name, no date).

CRITICAL — THE REVIEW TONE MUST MATCH THE RATING. A 3-star review must NOT sound enthusiastic. A 5-star review must NOT have significant complaints. The sentiment must match the star count.

CRITICAL RULES FOR REALISM:
- Write like REAL American customers, not copywriters. Casual, conversational tone.
- Vary length massively: some are 1-2 sentences ("Brilliant knife, exactly what I needed. Lovely edge on it."), others are a short paragraph, very rarely a longer one.
- Include occasional typos, missing apostrophes, run-on sentences, starting with "So" or "Ok so", casual grammar ("got this for my husband", "cant believe how sharp it is")
- Reference SPECIFIC things about THIS product — if it's a gyuto talk about the rocking motion, if it's a santoku talk about the flat profile, if it has a resin handle mention the look/feel, if VG10 steel mention edge retention, etc.
- Talk about real cooking scenarios: "used it to break down a whole chicken", "makes quick work of onions", "been using it daily for 3 weeks now"
- Some reviews should mention POSITIVE packaging or delivery experiences ONLY ("came really well packaged", "arrived next day which was a bonus", "nice presentation box")
- A few should compare to previous knives ("massive upgrade from my old Victorinox", "way better than the Procook set I had")
- Include some that mention gifts ("bought this for my dad", "birthday present for the wife")
- Use American English — "color" not "colour", "favorite" not "favourite", etc.
- NEVER use phrases like "exceeded expectations", "game-changer", "I can't recommend enough", "worth every penny" — these scream fake
- NEVER use exclamation marks more than once in a review
- NEVER complain about packaging, missing items, wrong items, or delivery problems — these create false customer service issues
- NEVER mention product defects or quality problems like chipping, rusting, bending, breaking, loose handles, dull edges on arrival, or any manufacturing flaw — these are damaging and false
- Minor complaints should ONLY be about subjective knife preferences ("handle took a bit of getting used to", "slightly heavier than I expected but I actually prefer it now", "wish it came in a slightly longer size")

Return ONLY a JSON array of ${totalCount} objects. No markdown, no code blocks.`;
}

const SYSTEM_PROMPT = `You write product reviews that are indistinguishable from real customer reviews. You never sound like AI. You write naturally with imperfect grammar, casual American English, and genuine-sounding opinions. You vary your style dramatically between reviews.`;

async function callProvider(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2min for large batches

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.95,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      return data.content[0].text;
    }

    const baseUrl = provider === "deepseek"
      ? "https://api.deepseek.com"
      : "https://api.openai.com/v1";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.95,
        max_tokens: 8192,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${provider} API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const { productId, count, dateFrom, dateTo } = await request.json();

    if (!productId || !count || count < 1 || count > 100) {
      return NextResponse.json(
        { error: "Provide productId and count (1-100)" },
        { status: 400 }
      );
    }

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "Provide dateFrom and dateTo" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // Load AI settings
    const { data: settingsRows } = await admin
      .from("settings")
      .select("key, value")
      .in("key", ["ai_provider", "ai_api_key", "ai_model"]);

    const settings: Record<string, string> = {};
    settingsRows?.forEach((row) => {
      settings[row.key] = row.value;
    });

    const { ai_provider, ai_api_key, ai_model } = settings;
    if (!ai_provider || !ai_api_key || !ai_model) {
      return NextResponse.json(
        { error: "AI not configured" },
        { status: 400 }
      );
    }

    // Fetch product
    const { data: products } = await admin
      .from("products")
      .select("id, name, slug, short_description, description, price, categories")
      .eq("id", productId)
      .limit(1);

    if (!products?.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const product = products[0];

    // Fetch attributes
    const { data: attrs } = await admin
      .from("product_attributes")
      .select("attribute_name, attribute_value")
      .eq("product_id", productId);

    const attrSummary = attrs?.length
      ? Array.from(
          attrs.reduce((m, a) => {
            if (!m.has(a.attribute_name)) m.set(a.attribute_name, []);
            m.get(a.attribute_name)!.push(a.attribute_value);
            return m;
          }, new Map<string, string[]>())
        )
          .map(([name, vals]) => `${name}: ${vals.join(", ")}`)
          .join("; ")
      : "";

    // Pre-compute ratings and group them for the prompt
    const ratings: number[] = [];
    for (let i = 0; i < count; i++) ratings.push(pickRating());

    const ratingCounts = new Map<number, number>();
    for (const r of ratings) ratingCounts.set(r, (ratingCounts.get(r) || 0) + 1);
    const ratingBreakdown = Array.from(ratingCounts.entries())
      .map(([rating, cnt]) => ({ rating, count: cnt }))
      .sort((a, b) => b.rating - a.rating);

    // Generate reviews via AI (with rating-aware prompt)
    const prompt = buildPrompt(product, ratingBreakdown, attrSummary);
    const raw = await callProvider(ai_provider, ai_api_key, ai_model, prompt);

    // Parse the JSON array of {rating, text} objects
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Handle both formats: [{rating, text}] or [string]
    const reviewItems: { rating: number; text: string }[] = Array.isArray(parsed)
      ? parsed.map((item: any, i: number) =>
          typeof item === "string"
            ? { rating: ratings[i] || 5, text: item }
            : { rating: item.rating || ratings[i] || 5, text: item.text || item.review || "" }
        )
      : [];

    if (!reviewItems.length) {
      throw new Error("AI returned invalid review data");
    }

    // Push each review to WooCommerce
    const results: { reviewer: string; rating: number; review: string; date: string; ok: boolean; error?: string }[] = [];

    for (const item of reviewItems) {
      const reviewer = randomName();
      const rating = item.rating;
      const dateCreated = randomDate(dateFrom, dateTo);

      try {
        await wcFetch("/products/reviews", {
          method: "POST",
          body: JSON.stringify({
            product_id: productId,
            review: item.text,
            reviewer,
            reviewer_email: `${reviewer.toLowerCase().replace(/[^a-z]/g, "")}${Math.floor(Math.random() * 999)}@gmail.com`,
            rating,
            verified: true,
            date_created: dateCreated,
          }),
        });
        results.push({ reviewer, rating, review: item.text, date: dateCreated, ok: true });
      } catch (err) {
        results.push({
          reviewer,
          rating,
          review: item.text,
          date: dateCreated,
          ok: false,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      productName: product.name,
      generated: reviewItems.length,
      pushed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate reviews" },
      { status: 500 }
    );
  }
}
