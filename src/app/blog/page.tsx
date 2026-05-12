import { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { storeConfig } from "../../../store.config";

export const metadata: Metadata = {
  title: `Blog | ${storeConfig.name}`,
  description: "Expert guides on Japanese kitchen knives — care tips, steel types, knife comparisons, and the craft behind every blade.",
  alternates: { canonical: `${storeConfig.url}/blog` },
};

export default async function BlogPage() {
  const posts = await getAllPosts();

  // Group by year
  const byYear = new Map<string, typeof posts>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(post);
  }

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 lg:py-14">
      {/* Header */}
      <div className="max-w-2xl mb-12 lg:mb-16">
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-light leading-tight mb-4">
          The Journal
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Guides, comparisons, and the stories behind Japanese kitchen knives.
        </p>
      </div>

      {/* Post grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10 lg:gap-y-14">
        {posts.map((post) => (
          <article key={post.slug} className="group">
            <Link href={`/blog/${post.slug}`} className="block">
              {post.featuredImage && (
                <div className="aspect-[3/2] overflow-hidden bg-muted mb-4">
                  <img
                    src={post.featuredImage}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              )}

              {post.categories?.[0] && (
                <span className="text-[11px] tracking-[0.2em] uppercase text-primary font-medium">
                  {post.categories[0]}
                </span>
              )}

              <h2 className="font-serif text-xl lg:text-[1.35rem] font-normal leading-snug mt-1.5 mb-2 group-hover:text-primary transition-colors">
                {post.title}
              </h2>

              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {post.excerpt}
              </p>

              <time
                dateTime={post.date}
                className="block text-xs text-muted-foreground/60 mt-3"
              >
                {new Date(post.date).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
