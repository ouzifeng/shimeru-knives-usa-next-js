import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const STORAGE_BUCKET = "blog-images";

// Strip absolute URLs to either Shimeru domain so internal links become relative.
const ABSOLUTE_INTERNAL_RE =
  /https?:\/\/(?:www\.)?(?:us\.)?shimeruknives\.(?:co\.uk|com)/gi;

interface SoroItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
  bodyHtml: string;
  imageUrl: string | null;
}

// ---- RSS parsing ---------------------------------------------------------

function extractCdataOrText(xml: string, tag: string): string | null {
  // Allow tag names with colons (e.g. content:encoded). Escape : just in case.
  const safe = tag.replace(/[:]/g, "\\:");
  const cdata = xml.match(
    new RegExp(`<${safe}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${safe}>`, "i")
  );
  if (cdata) return cdata[1].trim();
  const plain = xml.match(new RegExp(`<${safe}[^>]*>([\\s\\S]*?)</${safe}>`, "i"));
  return plain ? plain[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

function parseFeed(xml: string): SoroItem[] {
  const items: SoroItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of itemMatches) {
    const block = m[1];
    const title = extractCdataOrText(block, "title");
    const link = extractCdataOrText(block, "link");
    const guid = extractCdataOrText(block, "guid");
    const pubDate = extractCdataOrText(block, "pubDate");
    const description = extractCdataOrText(block, "description");
    const bodyHtml = extractCdataOrText(block, "content:encoded");
    const imageUrl = extractAttr(block, "enclosure", "url");

    if (!title || !link || !guid || !bodyHtml) continue;

    items.push({
      title,
      link,
      guid,
      pubDate: pubDate || new Date().toUTCString(),
      description: description || "",
      bodyHtml,
      imageUrl,
    });
  }
  return items;
}

// ---- Helpers -------------------------------------------------------------

function slugFromLink(link: string): string {
  try {
    const u = new URL(link);
    return u.pathname.replace(/^\//, "").replace(/\/$/, "");
  } catch {
    return link;
  }
}

function rewriteInternalLinks(html: string): string {
  return html.replace(ABSOLUTE_INTERNAL_RE, "");
}

function extFromContentType(ct: string | null): string {
  if (!ct) return "bin";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("gif")) return "gif";
  return "bin";
}

async function mirrorImage(
  admin: ReturnType<typeof getSupabaseAdmin>,
  imageUrl: string,
  guid: string,
  year: string
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type");
    const ext = extFromContentType(ct);
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `${year}/${guid}.${ext}`;

    const { error } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, {
        contentType: ct || "application/octet-stream",
        upsert: true,
      });
    if (error) {
      console.error("Image upload failed:", error.message);
      return null;
    }

    const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error("Image mirror error:", e);
    return null;
  }
}

// ---- Route handler -------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feedUrl = process.env.SORO_RSS_URL;
  if (!feedUrl) {
    return NextResponse.json({ error: "SORO_RSS_URL not set" }, { status: 500 });
  }

  // Fetch feed
  const feedRes = await fetch(feedUrl, { cache: "no-store" });
  if (!feedRes.ok) {
    return NextResponse.json(
      { error: `Soro feed fetch failed: ${feedRes.status}` },
      { status: 502 }
    );
  }
  const xml = await feedRes.text();
  const items = parseFeed(xml);

  if (items.length === 0) {
    return NextResponse.json({ ok: true, items: 0, inserted: 0 });
  }

  const admin = getSupabaseAdmin();

  // Find which GUIDs we already have
  const guids = items.map((i) => i.guid);
  const { data: existing } = await admin
    .from("blog_posts")
    .select("soro_guid")
    .in("soro_guid", guids);
  const existingGuids = new Set((existing ?? []).map((r) => r.soro_guid));

  const summary: {
    ok: true;
    items: number;
    inserted: number;
    skipped: number;
    errors: string[];
  } = { ok: true, items: items.length, inserted: 0, skipped: 0, errors: [] };

  for (const item of items) {
    if (existingGuids.has(item.guid)) {
      summary.skipped++;
      continue;
    }

    try {
      const slug = slugFromLink(item.link);
      if (!slug) {
        summary.errors.push(`${item.guid}: empty slug`);
        continue;
      }

      const publishedAt = new Date(item.pubDate);
      const year = String(publishedAt.getUTCFullYear());

      // Mirror image to our storage
      let imageUrl: string | null = null;
      if (item.imageUrl) {
        imageUrl = await mirrorImage(admin, item.imageUrl, item.guid, year);
      }

      // Rewrite internal links to be relative
      const bodyHtml = rewriteInternalLinks(item.bodyHtml);

      const { error: insertError } = await admin.from("blog_posts").insert({
        slug,
        soro_guid: item.guid,
        title: item.title,
        excerpt: item.description || null,
        body_html: bodyHtml,
        meta_title: item.title,
        meta_description: item.description || null,
        featured_image_url: imageUrl,
        featured_image_alt: item.title,
        categories: [],
        status: "published",
        published_at: publishedAt.toISOString(),
        source: "soro",
      });

      if (insertError) {
        summary.errors.push(`${slug}: ${insertError.message}`);
        continue;
      }

      summary.inserted++;
    } catch (e) {
      summary.errors.push(`${item.guid}: ${(e as Error).message}`);
    }
  }

  if (summary.inserted > 0) {
    revalidatePath("/blog");
    revalidatePath("/blog/[slug]", "page");
  }

  return NextResponse.json(summary);
}
