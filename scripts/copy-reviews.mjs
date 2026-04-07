/**
 * Copy reviews from UK WooCommerce to US WooCommerce, matching by SKU.
 *
 * Usage: node scripts/copy-reviews.mjs [--dry-run]
 */

const UK_BASE = "https://backend.shimeruknives.co.uk/wp-json/wc/v3";
const UK_CK = "ck_bf240b81f2ba76bcf09627e813d7f9a2d88a535b";
const UK_CS = "cs_010b801ce6e24cfb85a01a9b647e9952336e9421";

const US_BASE = "https://shimeruknives.com/wp-json/wc/v3";
const US_CK = "ck_7c745fb1dcfa672ac96a1f03ea867d1254842491";
const US_CS = "cs_5cd9ca2452fa3aa991d04a5fcf7dfccebee7b74b";

const DRY_RUN = process.argv.includes("--dry-run");

function ukUrl(path, params = "") {
  return `${UK_BASE}${path}?consumer_key=${UK_CK}&consumer_secret=${UK_CS}&per_page=100${params}`;
}
function usUrl(path, params = "") {
  return `${US_BASE}${path}?consumer_key=${US_CK}&consumer_secret=${US_CS}&per_page=100${params}`;
}

async function fetchAllPages(urlFn) {
  let page = 1;
  let all = [];
  while (true) {
    const url = urlFn(`&page=${page}`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`HTTP ${res.status} fetching ${url.substring(0, 100)}...`);
      break;
    }
    const data = await res.json();
    if (!data.length) break;
    all = all.concat(data);
    const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1");
    console.log(`  page ${page}/${totalPages} (${data.length} items)`);
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");

  // 1. Build US SKU -> product ID map
  console.log("\n1. Fetching US products...");
  const usProducts = await fetchAllPages((p) => usUrl("/products", p));
  const skuToUsId = {};
  for (const p of usProducts) {
    if (p.sku) skuToUsId[p.sku] = p.id;
  }
  console.log(`   ${Object.keys(skuToUsId).length} US products with SKUs`);

  // 2. Build UK product ID -> SKU map
  console.log("\n2. Fetching UK products...");
  const ukProducts = await fetchAllPages((p) => ukUrl("/products", p));
  const ukIdToSku = {};
  for (const p of ukProducts) {
    if (p.sku) ukIdToSku[p.id] = p.sku;
  }
  console.log(`   ${Object.keys(ukIdToSku).length} UK products with SKUs`);

  // 3. Fetch UK reviews and copy
  console.log("\n3. Fetching UK reviews...");
  let page = 1;
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let noMatch = 0;

  while (true) {
    const url = ukUrl("/products/reviews", `&page=${page}&status=approved`);
    const res = await fetch(url);
    if (!res.ok) { console.error(`HTTP ${res.status}`); break; }
    const reviews = await res.json();
    if (!reviews.length) break;
    const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1");
    console.log(`\n   Page ${page}/${totalPages} (${reviews.length} reviews)`);

    for (const review of reviews) {
      const sku = ukIdToSku[review.product_id];
      if (!sku) { skipped++; continue; }

      const usProductId = skuToUsId[sku];
      if (!usProductId) { noMatch++; continue; }

      // Strip HTML tags from review
      const cleanReview = review.review.replace(/<[^>]*>/g, "");

      if (DRY_RUN) {
        console.log(`   [DRY] Would copy: "${cleanReview.substring(0, 60)}..." -> US product ${usProductId} (${sku})`);
        copied++;
        continue;
      }

      // Post to US
      try {
        const postRes = await fetch(
          usUrl("/products/reviews"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: usProductId,
              review: cleanReview,
              reviewer: review.reviewer,
              reviewer_email: review.reviewer_email,
              rating: review.rating,
              status: "approved",
            }),
          }
        );
        if (postRes.ok) {
          copied++;
          if (copied % 50 === 0) console.log(`   ...copied ${copied} reviews so far`);
        } else {
          const err = await postRes.text();
          // Duplicate email per product — skip silently
          if (err.includes("woocommerce_rest_comment_duplicate")) {
            skipped++;
          } else {
            failed++;
            if (failed <= 5) console.error(`   Failed (${postRes.status}): ${err.substring(0, 150)}`);
          }
        }
      } catch (e) {
        failed++;
        if (failed <= 5) console.error(`   Error: ${e.message}`);
      }

      // Small delay to avoid rate limiting
      if (copied % 10 === 0) await new Promise(r => setTimeout(r, 200));
    }

    if (page >= totalPages) break;
    page++;
  }

  console.log(`\n=== Done ===`);
  console.log(`Copied:    ${copied}`);
  console.log(`Skipped:   ${skipped} (no SKU on UK product or duplicate)`);
  console.log(`No match:  ${noMatch} (SKU not found on US site)`);
  console.log(`Failed:    ${failed}`);
}

main().catch(console.error);
