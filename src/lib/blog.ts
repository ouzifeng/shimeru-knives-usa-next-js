import { getSupabase } from "@/lib/supabase";
import { resolveBlogTokens } from "@/lib/blog-gen/tokens";

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

interface DbBlogRow {
  slug: string;
  title: string;
  excerpt: string | null;
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
  featured_image_url: string | null;
  categories: string[] | null;
  published_at: string;
}

function rowToPost(row: DbBlogRow): BlogPost {
  return {
    title: row.title,
    slug: row.slug,
    date: row.published_at,
    excerpt: row.excerpt ?? "",
    featuredImage: row.featured_image_url ?? undefined,
    categories: row.categories ?? undefined,
    metaTitle: row.meta_title ?? undefined,
    metaDescription: row.meta_description ?? undefined,
    content: row.body_html,
  };
}

const SELECT_COLUMNS =
  "slug,title,excerpt,body_html,meta_title,meta_description,featured_image_url,categories,published_at";

export async function getAllPosts(): Promise<BlogPost[]> {
  const { data, error } = await getSupabase()
    .from("blog_posts")
    .select(SELECT_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    console.error("getAllPosts error:", error);
    return [];
  }

  return (data as DbBlogRow[]).map(rowToPost);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await getSupabase()
    .from("blog_posts")
    .select(SELECT_COLUMNS)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("getPostBySlug error:", error);
    return null;
  }
  if (!data) return null;

  const post = rowToPost(data as DbBlogRow);
  // Generated posts embed {{product:<id>}} tokens resolved to live cards here.
  // No-op for existing posts (they contain no tokens).
  post.content = await resolveBlogTokens(post.content);
  return post;
}
