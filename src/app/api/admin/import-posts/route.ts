import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const WP_URL = "https://shimeruknives.com";
const WP_USER = "user";
const WP_APP_PASSWORD = "8Xxs sa3y GtQX mvAN MxhU N31f";
const AUTH = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");

const BUCKET = "product-images";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

async function wpFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2${endpoint}`, {
    headers: { Authorization: `Basic ${AUTH}` },
  });
  if (!res.ok) throw new Error(`WP API ${res.status}: ${endpoint}`);
  return res.json();
}

async function wpFetchWithTotal(endpoint: string): Promise<{ data: any[]; total: number; totalPages: number }> {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2${endpoint}`, {
    headers: { Authorization: `Basic ${AUTH}` },
  });
  if (!res.ok) throw new Error(`WP API ${res.status}: ${endpoint}`);
  return {
    data: await res.json(),
    total: parseInt(res.headers.get("x-wp-total") || "0"),
    totalPages: parseInt(res.headers.get("x-wp-totalpages") || "0"),
  };
}

// Fetch all WP categories
async function fetchCategories(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let page = 1;
  while (true) {
    const cats = await wpFetch<any[]>(`/categories?per_page=100&page=${page}`);
    if (!cats.length) break;
    cats.forEach((c) => map.set(c.id, c.name));
    page++;
  }
  return map;
}

// Download image to Supabase storage, return public URL
async function uploadImage(
  admin: any,
  imageUrl: string,
  storagePath: string
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*",
      },
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";

    // Upload to Supabase storage
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error(`Upload failed for ${storagePath}:`, error.message);
      return null;
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
  } catch (err) {
    console.error(`Failed to download ${imageUrl}:`, err);
    return null;
  }
}

// Get featured image URL from WP media endpoint
async function getFeaturedImageUrl(mediaId: number): Promise<string | null> {
  if (!mediaId) return null;
  try {
    const media = await wpFetch<any>(`/media/${mediaId}`);
    return media.source_url || null;
  } catch {
    return null;
  }
}

// Replace inline image URLs in HTML content
async function replaceInlineImages(
  admin: any,
  html: string,
  slug: string
): Promise<string> {
  // Find all img src URLs pointing at the WP domain
  const imgRegex = /src="(https?:\/\/[^"]*shimeruknives[^"]*\.(jpg|jpeg|png|gif|webp|svg)[^"]*)"/gi;
  const matches = [...html.matchAll(imgRegex)];

  let result = html;
  let imgIndex = 0;

  for (const match of matches) {
    const originalUrl = match[1];
    const ext = match[2].toLowerCase();
    const storagePath = `blog/${slug}/img-${imgIndex}.${ext}`;

    const newUrl = await uploadImage(admin, originalUrl, storagePath);
    if (newUrl) {
      result = result.replace(originalUrl, newUrl);
    }
    imgIndex++;
  }

  return result;
}

// Convert HTML to clean-ish MDX-compatible content
function htmlToMdxContent(html: string): string {
  // Keep as HTML in MDX — it renders fine
  // Just clean up some WP artifacts
  return html
    .replace(/\r\n/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<p>&nbsp;<\/p>/g, "")
    .trim();
}

// Escape frontmatter values
function escapeFm(val: string): string {
  if (val.includes('"') || val.includes(":") || val.includes("#")) {
    return `"${val.replace(/"/g, '\\"')}"`;
  }
  return `"${val}"`;
}

export async function POST() {
  try {
    const admin = getSupabaseAdmin();

    // Ensure blog dir exists
    if (!existsSync(BLOG_DIR)) {
      await mkdir(BLOG_DIR, { recursive: true });
    }

    // Fetch all categories first
    const categoryMap = await fetchCategories();

    // Fetch all published posts
    const allPosts: any[] = [];
    const first = await wpFetchWithTotal("/posts?per_page=100&page=1&status=publish&_fields=id,title,slug,date,content,excerpt,featured_media,categories,yoast_head_json");
    allPosts.push(...first.data);

    for (let page = 2; page <= first.totalPages; page++) {
      const batch = await wpFetch<any[]>(`/posts?per_page=100&page=${page}&status=publish&_fields=id,title,slug,date,content,excerpt,featured_media,categories,yoast_head_json`);
      allPosts.push(...batch);
    }

    const results: { slug: string; title: string; ok: boolean; error?: string }[] = [];

    for (const post of allPosts) {
      try {
        const title = post.title.rendered.replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&#8211;/g, "–").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"');
        const slug = post.slug;
        const date = post.date.split("T")[0]; // YYYY-MM-DD
        const excerpt = (post.excerpt?.rendered || "")
          .replace(/<[^>]*>/g, "")
          .replace(/\n/g, " ")
          .trim()
          .slice(0, 200);

        // Categories
        const cats = (post.categories || [])
          .map((id: number) => categoryMap.get(id))
          .filter(Boolean);

        // Yoast SEO
        const yoast = post.yoast_head_json || {};
        const metaTitle = yoast.title || title;
        const metaDescription = yoast.description || excerpt;

        // Featured image
        let featuredImage = "";
        if (post.featured_media) {
          const wpImgUrl = await getFeaturedImageUrl(post.featured_media);
          if (wpImgUrl) {
            const ext = wpImgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || "jpg";
            const storagePath = `blog/${slug}/featured.${ext}`;
            const uploaded = await uploadImage(admin, wpImgUrl, storagePath);
            if (uploaded) featuredImage = uploaded;
          }
        }

        // Process content — replace inline images
        let content = post.content.rendered;
        content = await replaceInlineImages(admin, content, slug);
        content = htmlToMdxContent(content);

        // Build MDX file
        const frontmatter = [
          "---",
          `title: ${escapeFm(title)}`,
          `slug: ${escapeFm(slug)}`,
          `date: ${escapeFm(date)}`,
          `excerpt: ${escapeFm(excerpt)}`,
          ...(featuredImage ? [`featuredImage: ${escapeFm(featuredImage)}`] : []),
          ...(cats.length ? [`categories: [${cats.map((c: string) => escapeFm(c)).join(", ")}]`] : []),
          ...(metaTitle !== title ? [`metaTitle: ${escapeFm(metaTitle)}`] : []),
          ...(metaDescription ? [`metaDescription: ${escapeFm(metaDescription)}`] : []),
          "---",
        ].join("\n");

        const mdxContent = `${frontmatter}\n\n${content}\n`;

        // Write MDX file
        await writeFile(path.join(BLOG_DIR, `${slug}.mdx`), mdxContent, "utf-8");

        results.push({ slug, title, ok: true });
      } catch (err) {
        results.push({
          slug: post.slug,
          title: post.title?.rendered || "Unknown",
          ok: false,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: allPosts.length,
      imported: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
