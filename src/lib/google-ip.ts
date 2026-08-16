const SOURCES = [
  "https://www.gstatic.com/ipranges/goog.json",
  "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
  "https://developers.google.com/static/search/apis/ipranges/special-crawlers.json",
  "https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json",
];

const TTL_MS = 24 * 60 * 60 * 1000;
let cachedPrefixes: string[] = [];
let lastFetched = 0;
let inflight: Promise<string[]> | null = null;

async function loadPrefixes(): Promise<string[]> {
  const now = Date.now();
  if (cachedPrefixes.length && now - lastFetched < TTL_MS) return cachedPrefixes;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const responses = await Promise.all(
        SOURCES.map((url) =>
          fetch(url, { next: { revalidate: 86400 } })
            .then((r) => (r.ok ? r.json() : { prefixes: [] }))
            .catch(() => ({ prefixes: [] }))
        )
      );
      const set = new Set<string>();
      for (const data of responses as Array<{ prefixes?: Array<{ ipv4Prefix?: string }> }>) {
        for (const p of data.prefixes || []) {
          if (p.ipv4Prefix) set.add(p.ipv4Prefix);
        }
      }
      cachedPrefixes = Array.from(set);
      lastFetched = Date.now();
    } catch {
      // keep stale cache on failure
    }
    return cachedPrefixes;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [prefix, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const ipInt = ipToInt(ip);
  const prefixInt = ipToInt(prefix);
  if (ipInt === null || prefixInt === null || isNaN(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (prefixInt & mask);
}

export async function isGoogleIp(ip: string | null | undefined): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  const prefixes = await loadPrefixes();
  return prefixes.some((cidr) => isIpInCidr(ip, cidr));
}

export async function getGoogleIpPrefixes(): Promise<string[]> {
  return loadPrefixes();
}
