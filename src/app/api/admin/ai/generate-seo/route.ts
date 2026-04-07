import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { storeConfig } from "../../../../../../store.config";

function buildPrompt(product: any, storeName: string, currency: string): string {
  const categories = (product.categories as any[])?.map((c: any) => c.name).join(", ") || "";
  const attributes = product.attribute_summary || "";
  const plainDesc = (product.short_description || product.description || "")
    .replace(/<[^>]*>/g, "")
    .slice(0, 800);
  const imageCount = (product.images as any[])?.length || 0;
  const imageNames = (product.images as any[])
    ?.map((img: any, i: number) => `Image ${i + 1}: ${img.name || img.alt || "product photo"}`)
    .join("\n") || "";

  return `You are a world-class ecommerce SEO specialist. Generate comprehensive SEO metadata for this product.

STORE: ${storeName}
CURRENCY: ${currency}

PRODUCT DATA:
- Name: ${product.name}
- Price: ${product.price} ${currency}
${product.regular_price && product.on_sale ? `- Was: ${product.regular_price} ${currency} (ON SALE)` : ""}
- Categories: ${categories || "Uncategorized"}
- Attributes: ${attributes || "None"}
- Stock: ${product.stock_status}
- Description: ${plainDesc || "No description available"}
- Images (${imageCount}):
${imageNames}

GENERATE the following as a JSON object. Follow these rules precisely:

1. "meta_title" (HARD LIMIT: 50 chars. Count every character including spaces and pipes. If over 50, rewrite shorter. Drop Japanese text, measurements, and filler to fit): Primary keyword first. Brand last. Format: "[Keyword] - [Modifier] | ${storeName}"

2. "meta_description" (HARD LIMIT: 140 chars. Count every character. If over 140, rewrite shorter): Primary keyword early. One differentiator. Soft CTA. No fluff.

3. "focus_keyword": The single most searchable buyer intent term. 2-4 words. Think like a buyer searching Google.

4. "og_title" (STRICT max 60 chars): Punchy, social-optimized. Make someone stop scrolling.

5. "og_description" (STRICT max 190 chars): Conversational, benefit-focused. Emotional hook.

6. "image_alt_texts": Array of strings, one per image (${imageCount} total). Each:
   - Describe what's visible specifically
   - Include product name or keyword naturally
   - 5-15 words, useful for screen readers
   - Never start with "Image of" or "Photo of"
   - Each unique (front view, detail, in-use, etc.)

Return ONLY valid JSON, no markdown, no code blocks:
{"meta_title":"...","meta_description":"...","focus_keyword":"...","og_title":"...","og_description":"...","image_alt_texts":["...", "..."]}`;
}

const SYSTEM_PROMPT = `You are an elite ecommerce SEO consultant who has optimized product pages for top DTC brands. You understand search intent, keyword research, SERP psychology, and conversion copywriting. You write metadata that ranks AND converts. Every character counts — you never waste space on filler words. You always return valid JSON only.`;

async function callProvider(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      return data.content[0].text;
    }

    // OpenAI and DeepSeek use the same format
    const baseUrl = provider === "deepseek"
      ? "https://api.deepseek.com"
      : "https://api.openai.com/v1";

    console.log(`[SEO] Calling ${provider} model=${model} url=${baseUrl}/chat/completions`);

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
        temperature: 0.6,
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

function parseResponse(raw: string) {
  const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

export async function POST(request: Request) {
  try {
    const { productIds } = await request.json();

    if (!productIds?.length) {
      return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
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
        { error: "AI not configured. Set provider, API key, and model first." },
        { status: 400 }
      );
    }

    // Fetch products with their attributes
    const { data: products } = await admin
      .from("products")
      .select("id, name, slug, short_description, description, price, regular_price, on_sale, stock_status, categories, images")
      .in("id", productIds);

    if (!products?.length) {
      return NextResponse.json({ error: "No products found" }, { status: 404 });
    }

    // Fetch attributes for all products
    const { data: attrs } = await admin
      .from("product_attributes")
      .select("product_id, attribute_name, attribute_value")
      .in("product_id", productIds);

    const attrsByProduct = new Map<number, string>();
    if (attrs) {
      const grouped = new Map<number, Map<string, string[]>>();
      for (const a of attrs) {
        if (!grouped.has(a.product_id)) grouped.set(a.product_id, new Map());
        const pMap = grouped.get(a.product_id)!;
        if (!pMap.has(a.attribute_name)) pMap.set(a.attribute_name, []);
        pMap.get(a.attribute_name)!.push(a.attribute_value);
      }
      for (const [pid, aMap] of grouped) {
        const parts = Array.from(aMap.entries()).map(
          ([name, vals]) => `${name}: ${vals.join(", ")}`
        );
        attrsByProduct.set(pid, parts.join("; "));
      }
    }

    const results: {
      productId: number;
      name: string;
      meta_title: string;
      meta_description: string;
      focus_keyword: string;
      og_title: string;
      og_description: string;
      image_alt_texts: string[];
      error?: string;
    }[] = [];

    // Process sequentially to avoid rate limits
    for (const product of products) {
      const enriched = {
        ...product,
        attribute_summary: attrsByProduct.get(product.id) || "",
      };

      const prompt = buildPrompt(enriched, storeConfig.name, storeConfig.currency);

      try {
        const raw = await callProvider(ai_provider, ai_api_key, ai_model, prompt);
        const seo = parseResponse(raw);

        // Save to product_seo table
        await admin.from("product_seo").upsert(
          {
            product_id: product.id,
            meta_title: seo.meta_title,
            meta_description: seo.meta_description,
            focus_keyword: seo.focus_keyword,
            og_title: seo.og_title,
            og_description: seo.og_description,
            image_alt_texts: seo.image_alt_texts || [],
            generated_at: new Date().toISOString(),
            generated_by: `${ai_provider}/${ai_model}`,
          },
          { onConflict: "product_id" }
        );

        results.push({
          productId: product.id,
          name: product.name,
          ...seo,
        });
      } catch (err) {
        results.push({
          productId: product.id,
          name: product.name,
          meta_title: "",
          meta_description: "",
          focus_keyword: "",
          og_title: "",
          og_description: "",
          image_alt_texts: [],
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate SEO" },
      { status: 500 }
    );
  }
}
