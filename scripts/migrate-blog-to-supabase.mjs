// Migrate MDX blog posts from src/content/blog/*.mdx into Supabase blog_posts table.
// Idempotent: re-running skips slugs that already exist.
// Run from the repo root: `node scripts/migrate-blog-to-supabase.mjs`

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const env = {};
readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
  const i = line.indexOf("=");
  if (i < 1 || line.startsWith("#")) return;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
});

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const BLOG_DIR = join(process.cwd(), "src", "content", "blog");

function parseFrontmatter(rawInput) {
  // Normalise CRLF -> LF so the regex works regardless of file line endings
  const raw = rawInput.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const frontmatter = match[1];
  const content = match[2].trim();
  const data = {};

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      data[key] = inner
        .split(/,\s*/)
        .map((s) => s.replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
      continue;
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }

    data[key] = value;
  }

  return { data, content };
}

function toIsoDate(d) {
  if (!d) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + "T00:00:00Z").toISOString();
  return new Date(d).toISOString();
}

async function insertBatch(rows) {
  const res = await fetch(`${SB_URL}/rest/v1/blog_posts?on_conflict=slug`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert failed (${res.status}): ${text}`);
  }
}

async function main() {
  const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));
  console.log(`Found ${files.length} MDX files`);

  const rows = [];
  const skipped = [];

  for (const file of files) {
    const raw = readFileSync(join(BLOG_DIR, file), "utf-8");
    const { data, content } = parseFrontmatter(raw);

    if (!data.title || !data.slug) {
      skipped.push({ file, reason: "missing title or slug" });
      continue;
    }
    if (!content.trim()) {
      skipped.push({ file, reason: "empty body" });
      continue;
    }

    rows.push({
      slug: data.slug,
      soro_guid: null,
      title: data.title,
      excerpt: data.excerpt || null,
      body_html: content,
      meta_title: data.metaTitle || null,
      meta_description: data.metaDescription || null,
      featured_image_url: data.featuredImage || null,
      featured_image_alt: data.title,
      categories: Array.isArray(data.categories) ? data.categories : [],
      status: "published",
      published_at: toIsoDate(data.date),
      source: "wordpress",
    });
  }

  console.log(`Prepared ${rows.length} rows (${skipped.length} skipped)`);
  if (skipped.length) console.log("Skipped:", skipped);

  // Batch in chunks of 50 to keep payloads sane
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await insertBatch(batch);
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${rows.length}`);
  }

  console.log(`Done. Attempted ${rows.length} inserts (duplicates ignored).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
