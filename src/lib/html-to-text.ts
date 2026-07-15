/**
 * Converts an HTML email body to readable plain text.
 *
 * Inbound mail from clients like BT/Outlook webmail often arrives HTML-only,
 * with no plain-text alternative part. Postmark can only populate TextBody and
 * StrippedTextReply from a real text part, so those come through empty and the
 * message body would otherwise be lost. This recovers it.
 *
 * Output is text, never markup, so callers must not inject the result as HTML.
 */

const QUOTE_BLOCKS: RegExp[] = [
  // Gmail, Apple Mail, and the generic reply quote.
  /<blockquote[\s>][\s\S]*?<\/blockquote>/gi,
  /<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/gi,
  // Outlook desktop and web put the quoted thread after these markers.
  /<div[^>]*id="divRplyFwdMsg"[\s\S]*$/gi,
  /<div[^>]*id="appendonsend"[\s\S]*$/gi,
  // Thunderbird.
  /<div[^>]*class="[^"]*moz-cite-prefix[^"]*"[\s\S]*$/gi,
];

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  "#160": " ",
  mdash: "-",
  ndash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key in ENTITIES) return ENTITIES[key];

    if (key.startsWith("#x")) {
      const code = parseInt(key.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (key.startsWith("#")) {
      const code = parseInt(key.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return match;
  });
}

function extract(html: string, stripQuotes: boolean): string {
  let out = html.replace(/\r\n?/g, "\n");

  // Non-content elements first, before anything can be misread as text.
  out = out
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|title)[\s>][\s\S]*?<\/\1>/gi, "");

  if (stripQuotes) {
    for (const pattern of QUOTE_BLOCKS) out = out.replace(pattern, "");
  }

  // Collapse the source's own line wrapping to spaces before block tags
  // introduce the newlines we actually want to keep.
  out = out.replace(/\s+/g, " ");

  out = out
    .replace(/<br\s*\/?>/gi, "\n")
    // Both edges of a block element break the line: an opening tag can follow
    // text that never had a closing tag of its own.
    .replace(/<\/?(p|div|tr|h[1-6]|blockquote|pre|table|ul|ol)[^>]*>/gi, "\n\n")
    .replace(/<\/?(td|th)[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<hr[^>]*>/gi, "\n\n");

  out = out.replace(/<[^>]+>/g, "");
  out = decodeEntities(out);

  return out
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  const stripped = extract(html, true);
  // An inline reply written inside the quoted thread would be thrown away by
  // quote stripping. Losing formatting beats losing the message, so keep the
  // quotes in that case.
  if (stripped) return stripped;

  return extract(html, false);
}
