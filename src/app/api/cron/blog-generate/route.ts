import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { countUnusedTitles, refillQueue } from "@/lib/blog-gen/titles";
import { generateArticle, QueuedTitle } from "@/lib/blog-gen/article";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily in-house blog generator (replaces the paid Soro tool, runs in parallel
// with /api/cron/soro-ingest). Safe by default: if the queue is empty and a
// refill yields nothing, it no-ops rather than publishing junk.
const REFILL_THRESHOLD = 15;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const summary: Record<string, unknown> = { ok: true };

  try {
    // 1. Top up the title queue if it is running low.
    let unused = await countUnusedTitles();
    if (unused < REFILL_THRESHOLD) {
      const added = await refillQueue(`batch-${new Date().toISOString().slice(0, 10)}`);
      summary.refilled = added;
      unused += added;
    }

    // 2. Pull the highest-volume unused title.
    const { data: next } = await admin
      .from("blog_titles")
      .select("id,title,slug,target_keyword,secondary_keywords,intent,maps_to_category")
      .eq("status", "unused")
      .order("search_volume", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!next) {
      return NextResponse.json({ ...summary, published: 0, reason: "queue empty" });
    }

    // Guard against a slug that already exists as a post.
    const { data: clash } = await admin.from("blog_posts").select("slug").eq("slug", next.slug).maybeSingle();
    if (clash) {
      await admin.from("blog_titles").update({ status: "skipped" }).eq("id", next.id);
      return NextResponse.json({ ...summary, published: 0, reason: "slug already a post, skipped" });
    }

    // 3. Generate + publish.
    const post = await generateArticle(next as QueuedTitle);
    const { data: inserted, error: insErr } = await admin
      .from("blog_posts")
      .insert({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body_html: post.body_html,
        meta_title: post.meta_title,
        meta_description: post.meta_description,
        featured_image_url: post.featured_image_url,
        featured_image_alt: post.featured_image_alt,
        categories: post.categories,
        status: "published",
        published_at: new Date().toISOString(),
        source: "generated",
      })
      .select("id")
      .single();

    if (insErr) throw new Error("blog_posts insert failed: " + insErr.message);

    // 4. Retire the title (kept forever as the uniqueness ledger).
    await admin
      .from("blog_titles")
      .update({ status: "used", used_at: new Date().toISOString(), post_id: inserted.id })
      .eq("id", next.id);

    revalidatePath("/blog");
    revalidatePath("/blog/[slug]", "page");

    return NextResponse.json({ ...summary, published: 1, slug: post.slug, title: post.title, queueRemaining: unused - 1 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
