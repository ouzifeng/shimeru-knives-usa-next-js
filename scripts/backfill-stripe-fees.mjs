/**
 * Backfill stripe_fee for existing orders in Supabase.
 * Reads each order's payment_intent from Stripe to get the actual fee.
 *
 * Usage: node scripts/backfill-stripe-fees.mjs
 *
 * Requires: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in .env.local
 */

import { readFileSync } from "fs";

// Parse .env.local
const env = {};
readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) env[key.trim()] = rest.join("=").trim();
});

const STRIPE_KEY = env.STRIPE_SECRET_KEY;
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.method === "PATCH" ? "return=minimal" : "return=representation",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body}`);
  }
  if (options.method === "PATCH") return null;
  return res.json();
}

async function stripeFetch(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  // Get all completed orders with a payment intent but no stripe_fee
  const orders = await sbFetch(
    "/orders?status=eq.completed&stripe_payment_intent=not.is.null&or=(stripe_fee.is.null,stripe_fee.eq.0)&select=id,stripe_payment_intent&order=id"
  );

  console.log(`Found ${orders.length} orders to backfill`);

  let updated = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const pi = await stripeFetch(
        `/payment_intents/${order.stripe_payment_intent}?expand[]=latest_charge.balance_transaction`
      );
      if (!pi) { failed++; continue; }

      const bt = pi.latest_charge?.balance_transaction;
      const fee = bt?.fee ? bt.fee / 100 : 0;

      if (fee > 0) {
        await sbFetch(`/orders?id=eq.${order.id}`, {
          method: "PATCH",
          body: JSON.stringify({ stripe_fee: fee }),
        });
        updated++;
        if (updated % 20 === 0) console.log(`  ...updated ${updated}`);
      }

      // Small delay to avoid rate limits
      if (updated % 10 === 0) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      failed++;
      if (failed <= 5) console.error(`  Failed order ${order.id}:`, err.message);
    }
  }

  console.log(`\nDone — updated: ${updated}, failed: ${failed}`);
}

main().catch(console.error);
