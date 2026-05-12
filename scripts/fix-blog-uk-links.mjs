// One-shot script: rewrite UK product blocks in
// src/content/blog/introduction-to-japanese-knives.mdx so they:
//   1. Link to US product slugs (or category pages) via relative URLs
//   2. Drop the visible GBP price block (£ amounts inside <div class="wc-block-grid__product-price ...">)
//   3. Strip backend.shimeruknives.co.uk srcset URLs (Supabase URLs are kept)
//   4. Remove cards for products that don't exist on US (anano stays, but
//      its grid loses 2 of 3 siblings — drop that grid entirely)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MDX = path.join(
  __dirname,
  "..",
  "src",
  "content",
  "blog",
  "introduction-to-japanese-knives.mdx",
);

// UK slug → US relative URL, or null = remove this card
const SLUG_MAP = {
  "tetsuya-5-7-butcher-knife-with-leather-sheath":
    "/product/tetsuya-5-7-butcher-knife-with-leather-sheath",
  "arashi-5-2-butcher-knife-with-sheath":
    "/product/arashi-5-2-butcher-knife-with-sheath",
  "kiba-5-8-butcher-knife-with-leather-sheath":
    "/product/kiba-5-8-butcher-knife-with-leather-sheath",
  "misuzu-%e7%be%8e%e9%88%b4-7-5-damascus-steel-gyuto-japanese-chef-knife":
    "/product/misuzu-%e7%be%8e%e9%88%b4-7-5-damascus-steel-gyuto-japanese-chef-knife",
  "otaru-%e5%b0%8f%e6%a8%bd-8-damascus-steel-gyuto-japanese-chef-knife":
    "/product/otaru-%e5%b0%8f%e6%a8%bd-8-damascus-steel-gyuto-japanese-chef-knife",
  "kinzan-%e9%87%91%e5%b1%b1-7-7-damascus-steel-gyuto-japanese-chef-knife":
    "/product/kinzan-%e9%87%91%e5%b1%b1-7-7-damascus-steel-gyuto-japanese-chef-knife",
  // Anano US slug differs (8.5 vs 8) but it's the same product family
  "anano-8-stainless-steel-kiritsuke-knife":
    "/product/anano-8-5-kiritsuke-knife-%e5%88%87%e3%82%8a%e4%bb%98%e3%81%91%e5%8c%85%e4%b8%81",
  // Ebony Grain Kiritsuke and Yoshii Kiritsuke do not exist on US (US has
  // Yoshii Gyuto, different blade type). Remove these cards.
  "ebony-grain-8-kiritsuke-knife-%e5%88%87%e3%82%8a%e4%bb%98%e3%81%91%e5%8c%85%e4%b8%81": null,
  "yoshii-8-damascus-steel-kiritsuke-knife": null,
  // Chikugo nakiri does not exist on US; remove its card.
  "chikugo-7-damascus-pattern-nakiri-knife": null,
  "shikoku-7-damascus-steel-nakiri-knife":
    "/product/shikoku-7-nakiri-knife-%e8%8f%9c%e5%88%87%e3%82%8a%e5%8c%85%e4%b8%81",
  "kitakami-7-damascus-pattern-nakiri-knife":
    "/product/kitakami-7-nakiri-knife-%e8%8f%9c%e5%88%87%e3%82%8a%e5%8c%85%e4%b8%81",
  "asuka-%e9%a3%9b%e9%b3%a5-7%e2%80%b3-damascus-steel-santoku-knife-%e4%b8%89%e5%be%b3%e5%8c%85%e4%b8%81":
    "/product/asuka-%e9%a3%9b%e9%b3%a5-7%e2%80%b3-damascus-steel-santoku-knife-%e4%b8%89%e5%be%b3%e5%8c%85%e4%b8%81",
  "mizuki-%e7%91%9e%e6%a8%b9-7%e2%80%b3-damascus-steel-santoku-knife-%e4%b8%89%e5%be%b3%e5%8c%85%e4%b8%81":
    "/product/mizuki-%e7%91%9e%e6%a8%b9-7%e2%80%b3-damascus-steel-santoku-knife-%e4%b8%89%e5%be%b3%e5%8c%85%e4%b8%81",
  "suisen-%e6%b0%b4%e4%bb%99-7%e2%80%b3-damascus-steel-santoku-knife-%e4%b8%89%e5%be%b3%e5%8c%85%e4%b8%81":
    "/product/suisen-%e6%b0%b4%e4%bb%99-7%e2%80%b3-damascus-steel-santoku-knife-%e4%b8%89%e5%be%b3%e5%8c%85%e4%b8%81",
};

let src = fs.readFileSync(MDX, "utf8");
const before = src.length;

// Each grid is one big <div data-block-name="woocommerce/product-category" ...>
// containing one <ul class="wc-block-grid__products"> with 3
// <li class="wc-block-grid__product"> children, and ends with the
// distinctive `</ul></div>` close. Use that as the boundary so we don't
// stop at one of the inner nested </div> tags.
const GRID_RE =
  /<div data-block-name="woocommerce\/product-category"[^>]*>[\s\S]*?<\/ul><\/div>/g;

const PRODUCT_LI_RE =
  /<li class="wc-block-grid__product">[\s\S]*?<\/li>/g;

const HREF_RE =
  /href="https:\/\/backend\.shimeruknives\.co\.uk\/product\/([^"\/]+)\/?"/;

let gridsKept = 0;
let gridsDropped = 0;
let cardsKept = 0;
let cardsDropped = 0;

src = src.replace(GRID_RE, (gridHtml) => {
  const cards = gridHtml.match(PRODUCT_LI_RE) ?? [];
  const rewritten = [];

  for (const card of cards) {
    const m = card.match(HREF_RE);
    if (!m) {
      // Couldn't find a backend.shimeruknives.co.uk href — leave the card
      // alone (defensive; shouldn't happen on this file).
      rewritten.push(card);
      continue;
    }
    const ukSlug = m[1];
    const target = SLUG_MAP[ukSlug];
    if (target === null) {
      cardsDropped++;
      continue; // remove this card
    }
    if (target === undefined) {
      console.warn(
        `[fix-blog] No mapping for UK slug "${ukSlug}" — leaving card unchanged`,
      );
      rewritten.push(card);
      continue;
    }

    let next = card
      // 1. Rewrite href to the US-relative URL
      .replace(HREF_RE, `href="${target}"`)
      // 2. Drop the visible GBP price div (entire one-line block)
      .replace(
        /<div class="wc-block-grid__product-price[^"]*">[\s\S]*?<\/div>\s*/g,
        "",
      )
      // 3. Strip backend.shimeruknives.co.uk srcset entries — keeps only
      //    the leading Supabase URL (Supabase public bucket is reachable
      //    from US site as-is). Removes ", https://backend...uk/...{N}w"
      //    patterns; the trailing srcset closing quote stays.
      .replace(
        /,\s*https:\/\/backend\.shimeruknives\.co\.uk\/wp-content\/uploads\/[^"\s]+\s+\d+w/g,
        "",
      );

    rewritten.push(next);
    cardsKept++;
  }

  if (rewritten.length === 0) {
    gridsDropped++;
    return ""; // remove the whole grid (no cards left)
  }

  gridsKept++;
  // Reinsert the kept cards into the original grid wrapper.
  return gridHtml.replace(/<ul class="wc-block-grid__products">[\s\S]*?<\/ul>/, () =>
    `<ul class="wc-block-grid__products">${rewritten.join("")}</ul>`,
  );
});

// Final sanity: there should be no remaining backend.shimeruknives.co.uk
// product hrefs.
const stragglers = src.match(/backend\.shimeruknives\.co\.uk\/product\//g) ?? [];

fs.writeFileSync(MDX, src, "utf8");

console.log(`MDX size: ${before} -> ${src.length} bytes`);
console.log(`Grids: ${gridsKept} kept, ${gridsDropped} removed`);
console.log(`Cards: ${cardsKept} kept, ${cardsDropped} removed`);
console.log(`Remaining backend.shimeruknives.co.uk/product/ refs: ${stragglers.length}`);
