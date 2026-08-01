import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getAdsCustomer,
  getAccountTimeZone,
  readClickId,
  toAccountTime,
  uploadConversions,
  type PendingConversion,
} from "@/lib/google-ads-offline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Google needs time to make a click available for upload. Uploading the instant
// the order lands gets it rejected as an unknown click, so hold everything back
// a few hours. The cron runs hourly, so this only delays reporting, never drops.
const MIN_AGE_HOURS = 4;

// The conversion action's click-through window. Older clicks are rejected.
const MAX_AGE_DAYS = 90;

const BATCH_LIMIT = 200;

// Failed rows are retried on later runs, but a permanently broken order must not
// be retried forever.
const MAX_RETRY_IDS = 100;

const STATE_KEY = "ads_offline_upload_state";
const ACTION_KEY = "google_ads_offline_conversion_action_id";

// Per-order audit trail of what we sent and what Google said. Vercel has no
// persistent disk, so this lives in the settings table as a capped ring buffer.
// Read it with scripts/ads-upload-log.mjs.
const LOG_KEY = "ads_offline_upload_log";
const MAX_LOG_ENTRIES = 300;

// A sale we should report. "refunded" is excluded because the money went back;
// "partially_refunded" is included at its net value. Abandoned checkouts and
// wc_failed rows were never completed purchases.
const REPORTABLE_STATUSES = ["completed", "partially_refunded"];

interface UploadState {
  last_order_id: number;
  retry: number[];
  last_run?: string;
  last_result?: unknown;
}

/** One row per order we attempted to send. Field names kept short: the whole
 *  buffer is stored as a single settings value. */
interface LogEntry {
  /** when we sent it */
  t: string;
  /** WooCommerce order number, the id Google dedupes on */
  wc: string;
  /** which click id type carried it */
  click: string;
  value: number;
  cur: string;
  /** conversion_date_time exactly as Google received it */
  when: string;
  ok: boolean;
  err?: string;
}

interface OrderRow {
  id: number;
  created_at: string;
  amount_total: number | string | null;
  refunded_amount: number | string | null;
  currency: string;
  status: string;
  wc_order_id: number | null;
  customer_email: string | null;
  attribution: Record<string, unknown> | null;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dry=1 validates the payload against Google without recording anything.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";

  const admin = getSupabaseAdmin();

  // ── config + resume point ──────────────────────────────────────
  const { data: settingRows } = await admin
    .from("settings")
    .select("key, value")
    .in("key", [STATE_KEY, ACTION_KEY, LOG_KEY]);

  const settings: Record<string, string> = {};
  settingRows?.forEach((r) => {
    settings[r.key] = r.value;
  });

  const conversionActionId = settings[ACTION_KEY];
  if (!conversionActionId) {
    return NextResponse.json(
      { error: `No offline conversion action configured (settings.${ACTION_KEY})` },
      { status: 500 }
    );
  }

  let state: UploadState = { last_order_id: 0, retry: [] };
  try {
    if (settings[STATE_KEY]) state = { ...state, ...JSON.parse(settings[STATE_KEY]) };
  } catch {
    // Unreadable state — start from the beginning of the window rather than
    // silently skipping orders. Google dedupes by order_id so replays are safe.
  }

  // ── candidate orders ───────────────────────────────────────────
  const now = Date.now();
  const newestAllowed = new Date(now - MIN_AGE_HOURS * 3600_000).toISOString();
  const oldestAllowed = new Date(now - MAX_AGE_DAYS * 86400_000).toISOString();

  const columns =
    "id, created_at, amount_total, refunded_amount, currency, status, wc_order_id, customer_email, attribution";

  const { data: fresh, error: freshErr } = await admin
    .from("orders")
    .select(columns)
    .gt("id", state.last_order_id)
    .not("wc_order_id", "is", null)
    .in("status", REPORTABLE_STATUSES)
    .lt("created_at", newestAllowed)
    .gt("created_at", oldestAllowed)
    .order("id", { ascending: true })
    .limit(BATCH_LIMIT);

  if (freshErr) {
    return NextResponse.json({ error: freshErr.message }, { status: 500 });
  }

  // Rows that failed on an earlier run, re-read so a since-refunded order is
  // dropped rather than retried.
  let retryRows: OrderRow[] = [];
  if (state.retry.length) {
    const { data } = await admin
      .from("orders")
      .select(columns)
      .in("id", state.retry)
      .in("status", REPORTABLE_STATUSES)
      .gt("created_at", oldestAllowed);
    retryRows = (data ?? []) as OrderRow[];
  }

  const rows = [...retryRows, ...((fresh ?? []) as OrderRow[])];

  // ── build the batch ────────────────────────────────────────────
  const conversions: PendingConversion[] = [];
  let skippedNoClickId = 0;

  for (const o of rows) {
    const clickId = readClickId(o.attribution);
    if (!clickId) {
      // Organic, direct, or a paid click whose id we never captured. Nothing to
      // attribute to, so Google cannot accept it.
      skippedNoClickId++;
      continue;
    }

    const gross = Number(o.amount_total || 0);
    const refunded = Number(o.refunded_amount || 0);
    const net = Math.max(0, gross - refunded);
    if (net <= 0) continue;

    conversions.push({
      orderId: String(o.wc_order_id),
      clickIdKey: clickId.key,
      clickIdValue: clickId.value,
      email: o.customer_email,
      // US reports gross USD. There is no UK Flat Rate Scheme adjustment here,
      // matching the client-side tag in tracking.ts and the GA4 event in the
      // Stripe webhook. If these disagree the two paths cannot be compared.
      value: net,
      currency: o.currency,
      occurredAt: o.created_at,
    });
  }

  // ── upload ─────────────────────────────────────────────────────
  let outcome = { attempted: 0, accepted: 0, failures: [] as { orderId: string; message: string }[] };
  let uploadError: string | null = null;
  let timeZone = "Europe/London";

  if (conversions.length) {
    try {
      const customer = getAdsCustomer();
      timeZone = await getAccountTimeZone(customer);
      outcome = await uploadConversions({
        customer,
        customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
        conversionActionId,
        timeZone,
        conversions,
        validateOnly: dryRun,
      });
    } catch (err) {
      uploadError = err instanceof Error ? err.message : String(err);
      console.error("[ads-conversions] upload failed:", err);
    }
  }

  // ── audit trail ────────────────────────────────────────────────
  // One row per order we tried to send, so a future sale can be traced from the
  // database through to Google's answer without guessing.
  const failureByOrder = new Map(outcome.failures.map((f) => [f.orderId, f.message]));
  const sentAt = new Date().toISOString();
  const newEntries: LogEntry[] = conversions.map((c) => ({
    t: sentAt,
    wc: c.orderId,
    click: c.clickIdKey,
    value: c.value,
    cur: c.currency,
    when: toAccountTime(c.occurredAt, timeZone),
    ok: !uploadError && !failureByOrder.has(c.orderId),
    ...(uploadError
      ? { err: uploadError }
      : failureByOrder.has(c.orderId)
        ? { err: failureByOrder.get(c.orderId) }
        : {}),
  }));

  let log: LogEntry[] = [];
  try {
    if (settings[LOG_KEY]) log = JSON.parse(settings[LOG_KEY]) as LogEntry[];
  } catch {
    // Unreadable buffer — start a fresh one rather than losing this run's rows.
  }
  // Newest first, capped. The whole buffer is one settings value, so it cannot
  // be allowed to grow without bound.
  log = [...newEntries, ...log].slice(0, MAX_LOG_ENTRIES);

  // ── persist the resume point ───────────────────────────────────
  // The watermark advances even for rows we skipped or that failed: skipped rows
  // will never become uploadable, and failures are tracked separately. Without
  // this the cron would re-scan the same orders forever.
  const maxFreshId = (fresh ?? []).reduce(
    (max, o) => Math.max(max, (o as OrderRow).id),
    state.last_order_id
  );

  const failedOrderIds = new Set(outcome.failures.map((f) => f.orderId));
  const stillFailing = rows
    .filter((o) => failedOrderIds.has(String(o.wc_order_id)))
    .map((o) => o.id);

  // A transport-level failure means nothing was attempted, so keep the whole
  // batch queued rather than losing it.
  const retryNext = uploadError
    ? rows.map((o) => o.id)
    : stillFailing;

  const nextState: UploadState = {
    last_order_id: maxFreshId,
    retry: [...new Set(retryNext)].slice(-MAX_RETRY_IDS),
    last_run: new Date().toISOString(),
    last_result: {
      considered: rows.length,
      uploaded: outcome.accepted,
      skipped_no_click_id: skippedNoClickId,
      failures: outcome.failures.slice(0, 10),
      error: uploadError,
    },
  };

  if (!dryRun) {
    const stamp = new Date().toISOString();
    const writes: { key: string; value: string; updated_at: string }[] = [
      { key: STATE_KEY, value: JSON.stringify(nextState), updated_at: stamp },
    ];
    // Only touch the log when there was something to record, so quiet hours do
    // not rewrite the buffer for nothing.
    if (newEntries.length) {
      writes.push({ key: LOG_KEY, value: JSON.stringify(log), updated_at: stamp });
    }
    await admin.from("settings").upsert(writes, { onConflict: "key" });
  }

  return NextResponse.json({
    ok: !uploadError,
    dry_run: dryRun,
    considered: rows.length,
    with_click_id: conversions.length,
    skipped_no_click_id: skippedNoClickId,
    uploaded: outcome.accepted,
    failures: outcome.failures.slice(0, 10),
    error: uploadError,
    watermark: nextState.last_order_id,
    retry_queued: nextState.retry.length,
  });
}
