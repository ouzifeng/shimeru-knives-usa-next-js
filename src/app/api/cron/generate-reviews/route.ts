import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAiSettings, generateAndPushReviews } from "@/lib/reviews/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly review top-up, one category per weekday so each run is a small batch
// that comfortably fits inside the 300s Vercel ceiling. `count` is the weekly
// TOTAL for the category, spread across a few randomly-chosen products. Tweak
// the ranges here.
type Slot = { slug: string; min: number; max: number };
const SCHEDULE: Record<string, Slot[]> = {
  Mon: [{ slug: "gyuto", min: 10, max: 15 }],
  Tue: [{ slug: "santoku", min: 5, max: 10 }],
  Wed: [
    { slug: "kiritsuke", min: 3, max: 6 },
    { slug: "nakiri", min: 3, max: 7 },
  ],
  Thu: [{ slug: "cleaver", min: 2, max: 5 }],
  Fri: [{ slug: "knife-sets", min: 2, max: 5 }],
  Sat: [
    { slug: "japanese-breadknife", min: 2, max: 4 },
    { slug: "steak-knives", min: 1, max: 3 },
    { slug: "sharpener", min: 1, max: 3 },
  ],
  Sun: [],
};

// Stop starting new products once we've used this much wall-clock, leaving
// headroom under the 300s limit. Anything not reached is simply picked up the
// next time that category's day comes round.
const TIME_BUDGET_MS = 255_000;
// No single product gets dumped with more than this many reviews in one run.
const MAX_PER_PRODUCT = 3;
// Reviews are dated randomly across this many days back, so they look organic
// rather than all stamped at the cron's run time.
const SPREAD_DAYS = 7;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Spread `count` reviews across products (~2 each), capped per product.
function allocate(productIds: number[], count: number): Map<number, number> {
  const nProducts = Math.min(productIds.length, Math.max(1, Math.round(count / 2)));
  const chosen = shuffle(productIds).slice(0, nProducts);
  const alloc = new Map<number, number>(chosen.map((id) => [id, 0]));
  let remaining = count;
  let i = 0;
  while (remaining > 0) {
    const id = chosen[i % chosen.length];
    if ((alloc.get(id) ?? 0) < MAX_PER_PRODUCT) {
      alloc.set(id, (alloc.get(id) ?? 0) + 1);
      remaining--;
    } else if ([...alloc.values()].every((v) => v >= MAX_PER_PRODUCT)) {
      break; // every chosen product is full
    }
    i++;
  }
  return alloc;
}

function weekday(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(new Date());
}

const ALERT_TO = "mr.davidoak@gmail.com";
const ALERT_FROM = "Shimeru Cron <sales@us.shimeruknives.co.uk>";

// Email the admin ONLY when something went wrong (failures, or the time-budget
// guard tripped — the early warning that we're brushing the 300s ceiling). No
// email on a clean run, so an inbox hit always means "look at this".
async function sendFailureAlert(subject: string, lines: string[]): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    console.warn("[generate-reviews] POSTMARK_SERVER_TOKEN missing — cannot send alert");
    return;
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: ALERT_FROM,
        To: ALERT_TO,
        Subject: subject,
        TextBody: lines.join("\n"),
        MessageStream: "outbound",
      }),
    });
    if (!res.ok) {
      console.error("[generate-reviews] alert send failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[generate-reviews] alert send error:", err);
  }
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  const url = req.nextUrl;
  const authed =
    !cronSecret ||
    req.headers.get("authorization") === `Bearer ${cronSecret}` ||
    url.searchParams.get("secret") === cronSecret;
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Overrides for manual runs/testing:
  //   ?day=Wed                          run a specific day's schedule
  //   ?category=gyuto&min=10&max=15     run a single category on demand
  //   ?dry=1                            show the plan only, no AI/WC writes
  const dry = url.searchParams.get("dry") === "1";
  const dayParam = url.searchParams.get("day");
  const categoryParam = url.searchParams.get("category");

  let slots: Slot[];
  if (categoryParam) {
    slots = [
      {
        slug: categoryParam,
        min: Number(url.searchParams.get("min") ?? 3),
        max: Number(url.searchParams.get("max") ?? 6),
      },
    ];
  } else {
    const day = dayParam || weekday();
    slots = SCHEDULE[day] ?? [];
  }

  if (slots.length === 0) {
    return NextResponse.json({ ok: true, day: dayParam || weekday(), categories: [], note: "Nothing scheduled today" });
  }

  const reportDay = dayParam || weekday();

  try {
  const admin = getSupabaseAdmin();
  const settings = dry ? null : await getAiSettings(admin);
  if (!dry && !settings) {
    await sendFailureAlert("Review cron: AI not configured", [
      `Day: ${reportDay}`,
      "getAiSettings returned null — ai_provider/ai_api_key/ai_model missing from settings table.",
      "No reviews generated.",
    ]);
    return NextResponse.json({ error: "AI not configured" }, { status: 400 });
  }

  const now = Date.now();
  const dateTo = new Date(now).toISOString();
  const dateFrom = new Date(now - SPREAD_DAYS * 86_400_000).toISOString();

  const report: unknown[] = [];
  let grandPushed = 0;
  let grandFailed = 0;
  let grandSkipped = 0;

  for (const slot of slots) {
    const count = randInt(slot.min, slot.max);

    // Publish products in this category.
    const { data: pcRows } = await admin
      .from("product_categories")
      .select("product_id")
      .eq("category_slug", slot.slug);
    const ids = Array.from(new Set((pcRows ?? []).map((r) => r.product_id)));
    const { data: pubRows } = ids.length
      ? await admin.from("products").select("id, name").in("id", ids).eq("status", "publish")
      : { data: [] };
    const products = pubRows ?? [];

    if (!products.length) {
      report.push({ slug: slot.slug, count, products: 0, note: "No published products" });
      continue;
    }

    const nameById = new Map<number, string>(products.map((p) => [p.id, p.name]));
    const alloc = allocate(products.map((p) => p.id), count);

    const perProduct: unknown[] = [];
    let pushed = 0;
    let failed = 0;
    let skipped = 0;

    for (const [productId, n] of alloc) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        skipped += n;
        perProduct.push({ productId, name: nameById.get(productId), allocated: n, skipped: true });
        continue;
      }
      if (dry) {
        perProduct.push({ productId, name: nameById.get(productId), allocated: n, dry: true });
        continue;
      }
      try {
        const outcome = await generateAndPushReviews(admin, {
          productId,
          count: n,
          dateFrom,
          dateTo,
          settings: settings!,
        });
        pushed += outcome.pushed;
        failed += outcome.failed;
        perProduct.push({ productId, name: outcome.productName, allocated: n, pushed: outcome.pushed, failed: outcome.failed });
      } catch (err) {
        failed += n;
        perProduct.push({
          productId,
          name: nameById.get(productId),
          allocated: n,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    report.push({ slug: slot.slug, count, products: products.length, pushed, failed, skipped, perProduct });
    grandPushed += pushed;
    grandFailed += failed;
    grandSkipped += skipped;
  }

  const elapsedMs = Date.now() - started;

  // Alert only on a real problem: a generation/post failure, or the budget
  // guard skipping work (the 300s early warning the user asked for).
  if (!dry && (grandFailed > 0 || grandSkipped > 0)) {
    const reason = grandSkipped > 0 ? "TIME BUDGET HIT (300s risk)" : "generation failures";
    await sendFailureAlert(`Review cron problem: ${reason}`, [
      `Day: ${reportDay}`,
      `Elapsed: ${Math.round(elapsedMs / 1000)}s (guard ${TIME_BUDGET_MS / 1000}s, hard limit 300s)`,
      `Pushed: ${grandPushed}  Failed: ${grandFailed}  Skipped-by-budget: ${grandSkipped}`,
      grandSkipped > 0
        ? "Skipped > 0 means the run ran out of time before finishing — we are brushing the 300s ceiling and may need to split the day's categories or trim counts."
        : "One or more products failed to generate or post reviews (AI or WooCommerce error). See details below.",
      "",
      JSON.stringify(report, null, 2),
    ]);
  }

  return NextResponse.json({
    ok: true,
    day: reportDay,
    dry,
    elapsed_ms: elapsedMs,
    alerted: !dry && (grandFailed > 0 || grandSkipped > 0),
    categories: report,
  });
  } catch (err) {
    await sendFailureAlert("Review cron CRASHED", [
      `Day: ${reportDay}`,
      `Elapsed: ${Math.round((Date.now() - started) / 1000)}s`,
      "The cron threw before completing:",
      err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
    ]);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Review cron failed" },
      { status: 500 }
    );
  }
}
