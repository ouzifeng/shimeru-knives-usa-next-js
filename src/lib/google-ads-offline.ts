/**
 * Server-side Google Ads conversion upload (offline conversion import).
 *
 * The browser tag in purchase-tracker.tsx only reports a conversion if the
 * customer's browser cooperates: no ad blocker, no ITP, tab stays open long
 * enough, tracking settings fetch resolves. Measured UK capture on that path was
 * around 84%. This path reads straight from the orders table instead, so a sale
 * that exists in the database is reported whatever the browser did.
 *
 * Google attributes purely on the click id, so all we need is the gclid/gbraid/
 * wbraid we captured on landing plus the conversion action, which must live in
 * the same account as the campaign.
 */
import { GoogleAdsApi, errors, type Customer } from "google-ads-api";
import { createHash } from "node:crypto";

export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

export interface PendingConversion {
  /** Stable dedup key. Google discards a repeat upload of the same order_id. */
  orderId: string;
  clickIdKey: ClickIdKey;
  clickIdValue: string;
  /** Raw email. Hashed here, never sent in the clear. */
  email?: string | null;
  value: number;
  currency: string;
  /** ISO timestamp of the purchase. */
  occurredAt: string;
}

export interface UploadOutcome {
  attempted: number;
  accepted: number;
  failures: { orderId: string; message: string }[];
}

/**
 * Google requires the conversion time in the ACCOUNT's timezone with an
 * explicit UTC offset. Our timestamps are UTC and the account is Europe/London,
 * which is on BST for half the year, so the offset cannot be hardcoded.
 */
export function toAccountTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

  // Intl can render midnight as hour 24 in some locales.
  const hour = parts.hour === "24" ? "00" : parts.hour;

  const asIfUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +hour,
    +parts.minute,
    +parts.second
  );
  const offsetMin = Math.round((asIfUTC - d.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");

  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}${sign}${oh}:${om}`;
}

/** Google's required normalisation before hashing: trim, lowercase, SHA-256 hex. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function getAdsCustomer(): Customer {
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

/** Reads the account timezone, which the conversion timestamps depend on. */
export async function getAccountTimeZone(customer: Customer): Promise<string> {
  const rows = await customer.query(
    `SELECT customer.id, customer.time_zone FROM customer`
  );
  return rows[0]?.customer?.time_zone || "Europe/London";
}

/**
 * Upload a batch of conversions.
 *
 * partial_failure is on so one malformed row cannot reject the whole batch;
 * Google accepts the rest and reports the failures individually.
 *
 * Hashed email is attached alongside the click id where we have one. It costs
 * nothing when the click id already matches and gives Google a second way to
 * match when the click id alone fails.
 */
export async function uploadConversions(opts: {
  customer: Customer;
  customerId: string;
  conversionActionId: string;
  timeZone: string;
  conversions: PendingConversion[];
  includeUserIdentifiers?: boolean;
  validateOnly?: boolean;
}): Promise<UploadOutcome> {
  const {
    customer,
    customerId,
    conversionActionId,
    timeZone,
    conversions,
    includeUserIdentifiers = true,
    validateOnly = false,
  } = opts;

  if (!conversions.length) {
    return { attempted: 0, accepted: 0, failures: [] };
  }

  const conversionAction = `customers/${customerId}/conversionActions/${conversionActionId}`;

  const payload = conversions.map((c) => ({
    [c.clickIdKey]: c.clickIdValue,
    conversion_action: conversionAction,
    conversion_date_time: toAccountTime(c.occurredAt, timeZone),
    conversion_value: c.value,
    currency_code: c.currency,
    order_id: c.orderId,
    ...(includeUserIdentifiers && c.email
      ? { user_identifiers: [{ hashed_email: hashEmail(c.email) }] }
      : {}),
  }));

  const res = await customer.conversionUploads.uploadClickConversions({
    customer_id: customerId,
    conversions: payload,
    partial_failure: true,
    validate_only: validateOnly,
  } as never);

  const failures: { orderId: string; message: string }[] = [];
  const failedIndexes = new Set<number>();
  const pf = res.partial_failure_error;

  if (pf) {
    // partial_failure_error.message is only a batch summary ("Multiple errors in
    // details. First error: ..."). The real per-row reasons are serialised
    // GoogleAdsFailure protobufs in details, so decode them: otherwise every
    // failed row gets labelled with whatever the first row's problem was.
    for (const detail of pf.details ?? []) {
      try {
        const failure = errors.GoogleAdsFailure.decode(
          detail.value as Uint8Array
        );
        for (const e of failure.errors ?? []) {
          const element = e.location?.field_path_elements?.find(
            (f) => f.field_name === "conversions"
          );
          const index = element?.index != null ? Number(element.index) : -1;
          if (index >= 0) failedIndexes.add(index);
          failures.push({
            orderId: conversions[index]?.orderId ?? "(unknown)",
            message: e.message || JSON.stringify(e.error_code ?? {}),
          });
        }
      } catch {
        // Undecodable detail — keep the summary rather than losing the failure.
        failures.push({ orderId: "(batch)", message: pf.message || "rejected" });
      }
    }
  }

  // validate_only never populates results, so counting them would report zero
  // accepted on every dry run. Anything Google did not complain about passed.
  const accepted = validateOnly
    ? conversions.length - failedIndexes.size
    : (res.results ?? []).filter(
        (r: unknown) => r && Object.keys(r).length > 0
      ).length;

  return { attempted: conversions.length, accepted, failures };
}

/** Picks the most precise click id present on a stored attribution blob. */
export function readClickId(
  attribution: Record<string, unknown> | null | undefined
): { key: ClickIdKey; value: string } | null {
  if (!attribution) return null;
  for (const key of CLICK_ID_KEYS) {
    const value = attribution[key];
    if (typeof value === "string" && value) return { key, value };
  }
  return null;
}
