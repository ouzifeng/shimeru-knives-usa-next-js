// Shared helpers for the Postmark event webhooks to maintain
// marketing_campaigns counter columns. Counters are read-then-written
// (not atomic) — at Shimeru's scale the race-condition risk is
// negligible. If we ever need bulletproof accuracy, swap for a Postgres
// increment RPC.

import { getSupabaseAdmin } from "./supabase";

const TAG_PATTERN = /^campaign-([0-9a-f-]{36})$/i;

export function extractCampaignIdFromTag(tag: string | undefined | null): string | null {
  if (!tag) return null;
  const m = tag.match(TAG_PATTERN);
  return m?.[1] ?? null;
}

type CounterField =
  | "delivered_count"
  | "opened_count"
  | "clicked_count"
  | "bounced_count"
  | "unsubscribed_count";

export async function incrementCampaignCounter(
  campaignId: string,
  field: CounterField
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: row, error: readErr } = await supabase
    .from("marketing_campaigns")
    .select(field)
    .eq("id", campaignId)
    .maybeSingle();

  if (readErr || !row) {
    // Could be a Postmark event for a non-campaign send (e.g. transactional).
    // Or the campaign id from the Tag doesn't exist in our DB. Either way, skip.
    return;
  }

  const current = ((row as Record<string, unknown>)[field] as number | null) ?? 0;

  await supabase
    .from("marketing_campaigns")
    .update({ [field]: current + 1 })
    .eq("id", campaignId);
}
