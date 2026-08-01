# Server-side Google Ads conversions

**Built:** 1 August 2026
**Review date:** 8 August 2026
**Applies to:** both stores (`uk/` and `us/`, separate repos, same Google Ads account)

---

## 1. The problem this solved

Google Ads conversions were reported **only by the browser tag**. If an ad blocker,
Safari ITP, a slow tracking fetch or a closed tab got in the way, the sale was lost
outright with no retry. Measured UK capture on that path was **83.8%**.

Separately, the US store had been firing `AW-18104944916`, an account nobody owns,
so **every US conversion was discarded by Google** until 10:39 on 1 Aug 2026.

"Server-side tracking" did already exist, but **only for GA4**. Google Ads had no
server path at all.

---

## 2. What is now in place

### Google Ads account `1622692586`

| ID | Name | Type | State |
|---|---|---|---|
| 7527927767 | Purchase Shimeru Knives UK | WEBPAGE | **PRIMARY** (counted) |
| 7705676832 | Purchase Shimeru Knives UK (offline) | UPLOAD_CLICKS | secondary (reported only) |
| 7705287030 | Purchase Shimeru Knives US | WEBPAGE | secondary (reported only) |
| 7705425010 | Purchase Shimeru Knives US (offline) | UPLOAD_CLICKS | **PRIMARY** (counted) |

Secondary means recorded and reportable, but excluded from the Conversions column
and from Smart Bidding.

**UK is on the browser tag, parallel run in progress. US was swapped to
server-side on 1 Aug** because its web tag had recorded zero conversions ever,
so there was nothing to compare against and nothing to lose.

Swap or revert either market with:

```
STORE=uk node scripts/ads-swap-primary.mjs            # tag -> server-side
STORE=us node scripts/ads-swap-primary.mjs --revert    # server-side -> tag
```

It sets both actions in one update so the account is never momentarily counting
both, and refuses to run if the offline action has recorded nothing (`FORCE=1`
overrides).

### Code, both repos

| File | What changed |
|---|---|
| `src/lib/attribution.ts` | Capture `gbraid`/`wbraid`; stop discarding a paid click when sessionStorage already holds a record; capture GA4 `session_id`; **read click ids from Google's own `_gcl_aw`/`_gcl_gb`/`_gcl_gs` cookies** |
| `src/lib/google-ads-offline.ts` | New. Upload helper, timezone conversion, email hashing, per-row error decoding |
| `src/app/api/cron/ads-conversions/route.ts` | New. Hourly upload cron |
| `src/lib/tracking-server.ts` | GA4 MP now sends `session_id` + `engagement_time_msec`; dropped the no-op `gclid` param |
| `src/app/api/webhooks/stripe/route.ts` | Passes `session_id`; sends real product names instead of `Product 10969` |
| `vercel.json` | Added `/api/cron/ads-conversions` hourly |

Commits: UK `3cca332`, `8037e54`. US `0bb6b78`, `995e1ad`.

### Config, in each store's Supabase `settings` table

- `google_ads_offline_conversion_action_id` — UK `7705676832`, US `7705425010`
- `ads_offline_upload_state` — JSON watermark, written by the cron and the backfill

---

## 3. What the cron does

Runs hourly, `/api/cron/ads-conversions`, auth via `CRON_SECRET` bearer token.

1. Reads the store's offline action id and the watermark from `settings`.
2. Selects orders newer than the watermark, **at least 4 hours old**, inside the
   90-day click window, status `completed` or `partially_refunded`.
3. Builds one conversion per order from the stored click id, plus a SHA-256
   hashed email for enhanced matching. UK values are FRS-net, US gross.
4. Uploads with `partial_failure` on.
5. Saves the watermark, queues failures for retry.

**Why the 4 hour hold:** Google rejects a click it has not indexed yet. This is
why firing directly from the Stripe webhook is unreliable.

**It cannot double count.** `order_id` is the WooCommerce order number and Google
discards a repeat upload of the same one. The watermark is a second guard.

**It is not a gap-filler.** It uploads every order with a click id, not just the
ones the tag missed. There is no API that tells you which orders Google already
recorded, so selective top-up is impossible.

---

## 3a. The audit log

Every order the cron or the backfill sends is recorded per-order in
`settings.ads_offline_upload_log`, a capped ring buffer of the last 300 entries.
Vercel has no persistent disk, so this is the log file.

Each entry records when we sent it, the Woo order number, which click id type
carried it, the value, the conversion timestamp exactly as Google received it,
and whether Google accepted or rejected it with the reason.

```
node scripts/ads-upload-log.mjs            # both stores, last 7 days
STORE=us DAYS=30 node scripts/ads-upload-log.mjs
```

It also reconciles the log against what Google actually reports, which are two
different questions:

- **accepted** means the API took it
- **reported** means it surfaced in the account and can be bid on

Verdicts it can give:

| Output | Meaning |
|---|---|
| working end to end | sent, accepted and reported |
| accepted but not yet reported | normal for a few hours, investigate if it lasts a day |
| Google reports MORE than we sent | double counting, check the web action is secondary |
| nothing sent yet | no qualifying sales, or the cron has not run |

Note the log started on 1 Aug, so the 7 US orders backfilled that day are **not**
in it. They were deliberately not re-sent to populate it, since that would have
been a live test of dedup on an action that now feeds bidding.

---

## 4. Data loaded so far

- **US backfill: done.** 7 orders, $540.92, all accepted, 1 Aug 18:08.
  Includes yesterday's `wc#1011` ($54.99) which the broken tag never reported.
- **UK backfill: NOT DONE.** 377 conversions, £24,937.81, validated clean.
  Blocked by Google's 6-hour lock on a newly created conversion action.

---

## 5. TO DO NOW (was blocked on 1 Aug)

The UK offline action was created around 18:00 on 1 Aug, so the lock clears
around **midnight 1/2 Aug**. Any time after that:

```
cd C:/Users/David/desktop/next-woocommerce/uk
STORE=uk DRY=1 node scripts/ads-backfill.mjs    # check first
STORE=uk node scripts/ads-backfill.mjs          # then run
```

Expect roughly `UPLOADED 372 / 377` (about 5 rejections for clicks older than the
90-day window, which is correct behaviour). The hourly cron starts succeeding on
its own from the same moment.

---

## 6. THE 7-DAY CHECK (8 August 2026)

### One command

```
cd C:/Users/David/desktop/next-woocommerce/uk
node scripts/ads-compare-paths.mjs
```

Read-only. It prints, per market: real orders in our database, what share carry a
click id (**the capture rate**), what the browser tag reported, what the
server-side path reported, and a verdict.

### What to look for

**a) Capture rate.** This was 71% on UK before the `_gcl_aw` cookie fix shipped
on 1 Aug. That fix is the whole reason a full switch is viable, so this number
should now be well above 71%. It is the single most important figure on the page.

**b) The verdict.**

| Outcome | Meaning | Action |
|---|---|---|
| Server-side >= tag | Our data is at least as complete as Google's | **Swap** |
| Server-side < tag | Capture is still leaking | Do not swap, investigate |
| Server-side = 0 | Cron or backfill did not run | Fix that first |

### How to swap (when the verdict says so)

Set the offline action **primary** AND the web action **secondary in the same
change**. Doing only the first half double counts every sale from that moment,
because the two paths use different conversion actions AND different identifiers
(tag sends the Stripe session id, upload sends the Woo order number), so Google
cannot dedupe between them.

They cannot be merged into one action: `uploadClickConversions` only accepts an
`UPLOAD_CLICKS` action.

---

## 7. Also check on 8 August

**Did the offline dedup hold?** The 7 US conversions uploaded on 1 Aug should
appear as **7, not 14**. Google's order-id dedup is documented behaviour that has
not yet been observed on this account.

```
node scripts/_verify-offline.mjs
```

**The stray GA4 event.** UK order `wc#17017` (£149.99, 1 Aug 15:19) landed in the
**US** GA4 property as $186.32, host `www.shimeruknives.co.uk`. One event out of
about twenty, during the window when both stores' tracking settings were being
rewritten for the GA4 split. Root cause unproven because Supabase only keeps the
last `updated_at`. If more UK orders appear in the US property after 1 Aug, it is
a real leak and needs investigating.

```
node scripts/_ga4-trace.mjs
```

**US primary/secondary, still undecided.** The US offline action is secondary, so
those 7 backfilled conversions report but do not feed Smart Bidding. The US web
tag has produced literally zero conversions ever, so a parallel run there compares
something against nothing. Flipping US to server-side makes the backfill count.

---

## 8. Scripts

| Script | Purpose | Safe to re-run? |
|---|---|---|
| `ads-compare-paths.mjs` | **The 7-day decision.** Tag vs server-side, per market | Yes, read-only |
| `ads-backfill.mjs` | Historical upload, `STORE=uk\|us`, `DRY=1` to validate | Yes, dedupes on order id |
| `ads-offline-setup.mjs` | Creates/configures the offline actions, writes settings | Yes, idempotent |
| `_serverside-readiness.mjs` | Click id coverage per store | Yes, read-only |
| `_verify-offline.mjs` | Conversions by campaign x action | Yes, read-only |
| `_ga4-trace.mjs` | Which GA4 property each purchase landed in | Yes, read-only |
| `_ga4-streams.mjs` | Property currency and measurement ids | Yes, read-only |
| `_decode-partial.mjs` | Decodes per-row upload errors | Yes, validate only |

Underscore-prefixed scripts are diagnostics and are deliberately not committed.

---

## 9. Gotchas that cost time

- **A newly created conversion action is locked for 6 hours.** Google reports this
  as `NO_CONVERSION_ACTION_FOUND`, which reads like a wrong id. Only after a while
  does it become the honest "Try importing again in 6 hours."
- **`validate_only` never populates `results`.** Counting them reports zero
  accepted on every dry run. Success on a dry run means *no partial failure*.
- **`partial_failure_error.message` is only a batch summary.** The real per-row
  reasons are serialised protobufs in `.details` and must be decoded, or every
  failed row gets labelled with the first row's problem.
- **Conversion goals key on (category, origin), not on the action.** The offline
  action reports as PURCHASE/WEBSITE exactly like the web tag, so goals cannot
  separate them. Primary vs secondary is the only lever.
- **`segments.date DURING LAST_90_DAYS` is not valid GAQL.** Use explicit dates.
- **GA4 `purchaseRevenue` is converted to the property's reporting currency.**
  The UK property reports GBP, the US property USD, so a raw figure comparison
  across properties is meaningless without the FX rate.

---

## 10. Unrelated items still open

- Rotate the UK Stripe webhook signing secret (leaked in an earlier transcript).
- US campaign is on tROAS 3 with almost no conversion history, which is why a
  £30/day budget spends pennies. Spend decision, not actioned.
- YouTube videos unsynced (UK 9, US 3), never reviewed. No callouts or structured
  snippets on either campaign.
