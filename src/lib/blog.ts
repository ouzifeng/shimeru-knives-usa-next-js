import { readdir, readFile } from "fs/promises";
import path from "path";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

export interface BlogPost {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  featuredImage?: string;
  categories?: string[];
  metaTitle?: string;
  metaDescription?: string;
  content: string;
}

function parseFrontmatter(raw: string): { data: Record<string, any>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const frontmatter = match[1];
  const content = match[2].trim();
  const data: Record<string, any> = {};

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Handle arrays like ["cat1", "cat2"]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      data[key] = inner
        .split(/,\s*/)
        .map((s) => s.replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
      continue;
    }

    // Strip quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }

    data[key] = value;
  }

  return { data, content };
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const files = await readdir(BLOG_DIR);
  const mdxFiles = files.filter((f) => f.endsWith(".mdx"));

  const posts = await Promise.all(
    mdxFiles.map(async (file) => {
      const raw = await readFile(path.join(BLOG_DIR, file), "utf-8");
      const { data, content } = parseFrontmatter(raw);
      return {
        title: data.title || file.replace(".mdx", ""),
        slug: data.slug || file.replace(".mdx", ""),
        date: data.date || "",
        excerpt: data.excerpt || "",
        featuredImage: data.featuredImage || undefined,
        categories: data.categories || undefined,
        metaTitle: data.metaTitle || undefined,
        metaDescription: data.metaDescription || undefined,
        content,
      } as BlogPost;
    })
  );

  // Sort by date descending
  return posts.sort((a, b) => (b.date > a.date ? 1 : -1));
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const raw = await readFile(path.join(BLOG_DIR, `${slug}.mdx`), "utf-8");
    const { data, content } = parseFrontmatter(raw);
    return {
      title: data.title || slug,
      slug: data.slug || slug,
      date: data.date || "",
      excerpt: data.excerpt || "",
      featuredImage: data.featuredImage || undefined,
      categories: data.categories || undefined,
      metaTitle: data.metaTitle || undefined,
      metaDescription: data.metaDescription || undefined,
      content,
    };
  } catch {
    return null;
  }
}
