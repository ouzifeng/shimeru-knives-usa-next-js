import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const SPEC_FIELDS = ["blade_length", "steel_type", "handle_material", "knife_type", "best_for"] as const;

function buildPrompt(product: { name: string; description: string }): string {
  const plainDesc = (product.description || "")
    .replace(/<[^>]*>/g, "")
    .slice(0, 2000);

  return `You are a knife expert. Extract the following specs from this product listing. Only use information explicitly stated or clearly implied. If a spec cannot be determined, use "Unknown".

PRODUCT: ${product.name}

DESCRIPTION:
${plainDesc}

Extract these specs and return ONLY valid JSON (no markdown, no code blocks):

{
  "blade_length": "The blade length including unit, e.g. '7\"' or '8.5\"'",
  "steel_type": "The steel/blade material, e.g. 'Damascus Steel (VG10 Core)', '67-Layer Damascus', 'Stainless Steel', 'High Carbon Steel'",
  "handle_material": "The handle material, e.g. 'Black Resin with Gold Flake', 'Pakkawood', 'G10', 'Olive Wood'",
  "knife_type": "The knife style, e.g. 'Santoku', 'Gyuto', 'Nakiri', 'Kiritsuke', 'Butcher Knife'",
  "best_for": "What this knife excels at, 2-4 short uses, e.g. 'Slicing, Dicing, Mincing' or 'Meat, Vegetables, Fish'"
}

Be specific and accurate. Use the actual details from the description, not generic guesses.`;
}

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
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`${provider} API error ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeout);
  }
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
    settingsRows?.forEach((row) => { settings[row.key] = row.value; });

    const { ai_provider, ai_api_key, ai_model } = settings;
    if (!ai_provider || !ai_api_key || !ai_model) {
      return NextResponse.json(
        { error: "AI not configured. Set provider, API key, and model first." },
        { status: 400 }
      );
    }

    const { data: products } = await admin
      .from("products")
      .select("id, name, description")
      .in("id", productIds);

    if (!products?.length) {
      return NextResponse.json({ error: "No products found" }, { status: 404 });
    }

    const results: { productId: number; name: string; specs?: Record<string, string>; error?: string }[] = [];

    for (const product of products) {
      const prompt = buildPrompt(product);

      try {
        const raw = await callProvider(ai_provider, ai_api_key, ai_model, prompt);
        const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const specs = JSON.parse(cleaned);

        // Validate that we got the expected fields
        const row: Record<string, unknown> = {
          product_id: product.id,
          generated_at: new Date().toISOString(),
          generated_by: `${ai_provider}/${ai_model}`,
        };
        for (const field of SPEC_FIELDS) {
          row[field] = specs[field] || "Unknown";
        }

        await admin.from("product_specs").upsert(row, { onConflict: "product_id" });

        results.push({ productId: product.id, name: product.name, specs });
      } catch (err) {
        results.push({
          productId: product.id,
          name: product.name,
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate specs" },
      { status: 500 }
    );
  }
}
