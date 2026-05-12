import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { storeConfig } from "../../../../store.config";

export const revalidate = 3600;

// Sibling-store base URL for cross-region hreflang. The blog content folder
// is mirrored UK<->US, so a post at /blog/<slug> here normally has a sibling
// at the same path on the other store. We always emit both hreflang entries;
// Google quietly drops any that 404 (e.g. a US-only post with no UK twin).
const SIBLING_BASE_URL = "https://shimeruknives.co.uk";

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  const title = post.metaTitle || `${post.title} | ${storeConfig.name}`;
  const description = post.metaDescription || post.excerpt;
  const url = `${storeConfig.url}/blog/${post.slug}`;
  const siblingUrl = `${SIBLING_BASE_URL}/blog/${post.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        "en-US": url,
        "en-GB": siblingUrl,
      },
    },
    openGraph: {
      title: post.title,
      description,
      url,
      siteName: storeConfig.name,
      type: "article",
      publishedTime: post.date,
      ...(post.featuredImage && {
        images: [{ url: post.featuredImage, alt: post.title }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
    },
  };
}

function ArticleJsonLd({ post }: { post: NonNullable<Awaited<ReturnType<typeof getPostBySlug>>> }) {
  const url = `${storeConfig.url}/blog/${post.slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription || post.excerpt,
    url,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: storeConfig.name,
      url: storeConfig.url,
    },
    publisher: {
      "@type": "Organization",
      name: storeConfig.name,
      url: storeConfig.url,
    },
    ...(post.featuredImage && { image: post.featuredImage }),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: storeConfig.url },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${storeConfig.url}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  // Get related posts from same category
  const allPosts = await getAllPosts();
  const related = allPosts
    .filter(
      (p) =>
        p.slug !== post.slug &&
        post.categories?.some((c) => p.categories?.includes(c))
    )
    .slice(0, 3);

  return (
    <>
      <ArticleJsonLd post={post} />

      <article className="container mx-auto px-4 lg:px-8 py-8 lg:py-14">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden md:block text-xs tracking-wide text-muted-foreground mb-8">
          <ol className="flex items-center gap-2">
            <li><a href="/" className="hover:text-foreground transition-colors">Home</a></li>
            <li className="text-border">/</li>
            <li><a href="/blog" className="hover:text-foreground transition-colors">Blog</a></li>
            <li className="text-border">/</li>
            <li className="text-foreground truncate max-w-[300px]">{post.title}</li>
          </ol>
        </nav>

        {/* Header */}
        <header className="max-w-3xl mb-10 lg:mb-14">
          {post.categories?.[0] && (
            <span className="text-[11px] tracking-[0.2em] uppercase text-primary font-medium">
              {post.categories[0]}
            </span>
          )}

          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-light leading-tight mt-2 mb-4">
            {post.title}
          </h1>

          <time
            dateTime={post.date}
            className="text-sm text-muted-foreground"
          >
            {new Date(post.date).toLocaleDateString("en-US", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </header>

        {/* Featured image */}
        {post.featuredImage && (
          <div className="max-w-4xl mb-10 lg:mb-14">
            <div className="aspect-[2/1] overflow-hidden bg-muted">
              <img
                src={post.featuredImage}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div
          className="max-w-3xl prose-shimeru"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Back link */}
        <div className="max-w-3xl mt-12 pt-8 border-t border-border">
          <Link
            href="/blog"
            className="text-sm tracking-[0.15em] uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to all articles
          </Link>
        </div>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="bg-muted/40">
          <div className="container mx-auto px-4 lg:px-8 py-12 lg:py-16">
            <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-8">
              Related Articles
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
              {related.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group block">
                  {p.featuredImage && (
                    <div className="aspect-[3/2] overflow-hidden bg-muted mb-3">
                      <img
                        src={p.featuredImage}
                        alt={p.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <h3 className="font-serif text-lg font-normal leading-snug group-hover:text-primary transition-colors">
                    {p.title}
                  </h3>
                  <time dateTime={p.date} className="text-xs text-muted-foreground/60 mt-1.5 block">
                    {new Date(p.date).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </time>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
