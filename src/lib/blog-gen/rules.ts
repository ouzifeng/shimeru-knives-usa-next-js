// Hard-enforced content rules. The model is asked to follow them, but these run
// on the output regardless, because for an autonomous live pipeline the model
// never gets the final say.

export const BANNED_PHRASES = [
  "that said", "the good news is", "it is worth saying", "in conclusion",
  "in today's world", "when it comes to", "look no further", "elevate your",
  "in this article", "without further ado",
];

// No em dashes or en dashes anywhere (global house rule). Replace with commas.
export function stripDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ");
}

export function hasDashes(s: string): boolean {
  return /[—–]/.test(s);
}

export function wordCount(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

export function bannedHits(html: string): string[] {
  const lower = html.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

// Strip any internal <a href="/..."> whose path is not on the allowlist, keeping
// the anchor text. External links are left alone.
export function validateLinks(
  html: string,
  opts: { staticOk: Set<string>; categorySlugs: Set<string>; productSlugs: Set<string> }
): { html: string; stripped: number } {
  let stripped = 0;
  const out = html.replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href: string, text: string) => {
    if (!href.startsWith("/")) return m; // external, leave it
    if (linkOk(href, opts)) return m;
    stripped++;
    return text;
  });
  return { html: out, stripped };
}

function linkOk(
  href: string,
  opts: { staticOk: Set<string>; categorySlugs: Set<string>; productSlugs: Set<string> }
): boolean {
  if (opts.staticOk.has(href)) return true;
  const cat = href.match(/^\/product\?category=([a-z0-9-]+)$/);
  if (cat) return opts.categorySlugs.has(cat[1]);
  const prod = href.match(/^\/product\/(.+)$/);
  if (prod) return opts.productSlugs.has(decodeURIComponent(prod[1])) || opts.productSlugs.has(prod[1]);
  return false;
}

// Static routes a blog post may legitimately link to.
export const STATIC_LINK_ALLOWLIST = new Set<string>([
  "/product", "/knife-care", "/knife-guide", "/blog", "/contact", "/sale",
  "/shipping-and-delivery", "/refund_returns", "/terms-and-conditions", "/privacy-policy",
]);
