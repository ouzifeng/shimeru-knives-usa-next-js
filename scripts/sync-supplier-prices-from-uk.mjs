// Sync supplier_prices + supplier_settings from UK Supabase to US Supabase.
// Run from us/ folder. Reads UK env from sibling ../uk/.env.local.
//   node scripts/sync-supplier-prices-from-uk.mjs            # dry-run
//   node scripts/sync-supplier-prices-from-uk.mjs --commit   # actually upsert

import { readFileSync } from "fs";
import { resolve } from "path";

const COMMIT = process.argv.includes("--commit");

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 1 || line.startsWith("#")) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return env;
}

const usEnv = loadEnv(resolve(".env.local"));
const ukEnv = loadEnv(resolve("..", "uk", ".env.local"));

const UK = { url: ukEnv.NEXT_PUBLIC_SUPABASE_URL, key: ukEnv.SUPABASE_SERVICE_ROLE_KEY };
const US = { url: usEnv.NEXT_PUBLIC_SUPABASE_URL, key: usEnv.SUPABASE_SERVICE_ROLE_KEY };

if (!UK.url || !UK.key) throw new Error("Missing UK env (../uk/.env.local)");
if (!US.url || !US.key) throw new Error("Missing US env (.env.local)");

async function sb(target, path, opts = {}) {
  const res = await fetch(`${target.url}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: target.key,
      Authorization: `Bearer ${target.key}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadUsSkus() {
  const skus = new Set();
  for (const table of ["products", "product_variations"]) {
    let from = 0;
    while (true) {
      const rows = await sb(US, `/${table}?select=sku&sku=not.is.null&limit=1000&offset=${from}`);
      for (const r of rows) if (r.sku) skus.add(r.sku);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  return skus;
}

console.log("Reading UK supplier_prices…");
const ukRows = await sb(UK, "/supplier_prices?select=*");
console.log(`  UK rows: ${ukRows.length}`);

console.log("Reading UK supplier_settings…");
const ukSettings = await sb(UK, "/supplier_settings?select=*&id=eq.1");
console.log(`  UK fx: ${ukSettings[0]?.usd_to_gbp ?? "(none)"}`);

console.log("Loading US SKUs…");
const usSkus = await loadUsSkus();
console.log(`  US SKUs: ${usSkus.size}`);

const matched = ukRows.filter((r) => usSkus.has(r.sku));
const orphan = ukRows.filter((r) => !usSkus.has(r.sku));
console.log(`Matched: ${matched.length} / ${ukRows.length}`);
if (orphan.length) {
  console.log(`Orphan (UK SKU not in US):`);
  for (const r of orphan) console.log(`  - ${r.sku}`);
}

const payload = matched.map((r) => {
  const { id, ...rest } = r;
  return { ...rest, updated_at: new Date().toISOString() };
});

if (!COMMIT) {
  console.log("\n[dry-run] re-run with --commit to upsert into US.");
  console.log(`Would upsert ${payload.length} supplier_prices + 1 supplier_settings row.`);
  process.exit(0);
}

console.log("\nUpserting supplier_prices into US…");
for (let i = 0; i < payload.length; i += 100) {
  const batch = payload.slice(i, i + 100);
  await sb(US, "/supplier_prices?on_conflict=sku,supplier", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  console.log(`  upserted ${Math.min(i + 100, payload.length)}/${payload.length}`);
}

if (ukSettings[0]) {
  console.log("Upserting supplier_settings…");
  await sb(US, "/supplier_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: 1,
      usd_to_gbp: ukSettings[0].usd_to_gbp,
      updated_at: new Date().toISOString(),
    }),
  });
}

console.log("Done.");
