import { storeConfig } from "../../store.config";

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat(storeConfig.locale, {
    style: "currency",
    currency: storeConfig.currency,
  }).format(amount);
}

// WooCommerce stores product/category names with HTML entities (`&amp;`,
// `&#8217;`, etc). We decode at the data-fetch layer so storefront UI can
// render names verbatim without each render site repeating this.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function decodeEntities(s: string): string {
  if (!s || s.indexOf("&") === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const cp = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return body in NAMED_ENTITIES ? NAMED_ENTITIES[body] : m;
  });
}
