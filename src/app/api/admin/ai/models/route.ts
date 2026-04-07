import { NextResponse } from "next/server";

interface ModelInfo {
  id: string;
  name: string;
}

// Filter to only useful text generation models
function filterModels(models: { id: string }[], provider: string): ModelInfo[] {
  const SKIP_PATTERNS = [
    /embed/i, /tts/i, /whisper/i, /dall-e/i, /moderation/i,
    /davinci/i, /babbage/i, /curie/i, /ada(?!-)/i, /search/i,
    /similarity/i, /edit/i, /insert/i, /audio/i, /realtime/i,
    /transcri/i, /vision/i, /-\d{4}$/,  // dated snapshots
  ];

  return models
    .filter((m) => !SKIP_PATTERNS.some((p) => p.test(m.id)))
    .map((m) => ({
      id: m.id,
      name: formatModelName(m.id, provider),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatModelName(id: string, provider: string): string {
  if (provider === "anthropic") {
    // claude-sonnet-4-20250514 -> Claude Sonnet 4
    return id
      .replace(/^claude-/, "Claude ")
      .replace(/-(\d+)-\d+$/, " $1")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return id;
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  return filterModels(data.data || [], "openai");
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  return filterModels(data.data || [], "anthropic");
}

async function fetchDeepSeekModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch("https://api.deepseek.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
  const data = await res.json();
  return filterModels(data.data || [], "deepseek");
}

export async function POST(request: Request) {
  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Provider and API key required" }, { status: 400 });
    }

    let models: ModelInfo[];
    switch (provider) {
      case "openai":
        models = await fetchOpenAIModels(apiKey);
        break;
      case "anthropic":
        models = await fetchAnthropicModels(apiKey);
        break;
      case "deepseek":
        models = await fetchDeepSeekModels(apiKey);
        break;
      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch models" },
      { status: 500 }
    );
  }
}
