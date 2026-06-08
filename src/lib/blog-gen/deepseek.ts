// Thin DeepSeek client. Generation uses the reasoner ("pro") model, which needs
// a high max_tokens because chain-of-thought consumes the budget before the
// answer is emitted (8k truncates to empty; 16k is safe).

type Msg = { role: "system" | "user" | "assistant"; content: string };

const ENDPOINT = "https://api.deepseek.com/chat/completions";

export async function deepseek(messages: Msg[], opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model || "deepseek-reasoner",
      messages,
      max_tokens: opts.maxTokens || 16000,
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty content");
  return content as string;
}

// DeepSeek (esp. reasoner) sometimes wraps JSON in markdown fences.
export function parseJson<T = unknown>(content: string): T {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}
