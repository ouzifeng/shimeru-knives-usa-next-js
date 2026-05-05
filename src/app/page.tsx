import Link from "next/link";
import Image from "next/image";
import { queryProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { storeConfig } from "../../store.config";

export const revalidate = 3600; // 1 hour — sync cron triggers on-demand revalidation

/* ------------------------------------------------------------------ */
/*  JSON-LD                                                            */
/* ------------------------------------------------------------------ */
function HomepageJsonLd() {
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: storeConfig.name,
    url: storeConfig.url,
    description: storeConfig.description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${storeConfig.url}/product?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: storeConfig.name,
    url: storeConfig.url,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
    </>
  );
}

/* ================================================================== */

export default async function HomePage() {
  const { products } = await queryProducts({ per_page: 8, sort: "newest" });

  return (
    <>
      <HomepageJsonLd />

      {/* =============================================================
          1 · HERO — Cinematic split: massive type left, image right
          ============================================================= */}
      <section className="bg-foreground text-background relative overflow-hidden grain">
        <div className="grid lg:grid-cols-2 lg:min-h-[92vh]">
          {/* Copy */}
          <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 xl:px-24 py-24 sm:py-32 lg:py-20 relative z-10">
            <p className="text-[11px] sm:text-xs tracking-[0.45em] uppercase text-background/50 mb-7 fade-in-up">
              Japanese Sharpness &mdash; Made Simple
            </p>
            <h1 className="font-serif text-[clamp(2.6rem,5.8vw,5.8rem)] font-light leading-[1.03] tracking-[-0.01em] mb-7 fade-in-up-1">
              The Edge<br />
              Your Kitchen<br />
              is <em className="font-semibold not-italic">Missing</em>
            </h1>
            <p className="text-base sm:text-lg text-background/60 max-w-[26rem] leading-[1.7] mb-10 fade-in-up-2">
              Premium Japanese steel knives — sharper, harder, lighter.
              Designed for home cooks who care about craft.
            </p>
            <div className="flex flex-wrap gap-3 fade-in-up-3">
              <Link
                href="/product"
                className="bg-primary text-primary-foreground px-8 py-3.5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:opacity-90 transition-opacity"
              >
                Shop All Knives
              </Link>
              <Link
                href="/knife-guide"
                className="border border-background/20 px-8 py-3.5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:bg-background/[0.07] transition-colors"
              >
                Help Me Choose
              </Link>
            </div>

            {/* Decorative thin lines */}
            <div className="absolute bottom-10 left-6 sm:left-10 lg:left-16 xl:left-24 flex items-center gap-4 text-[10px] tracking-[0.3em] uppercase text-background/20">
              <span>Scroll</span>
              <div className="w-10 h-px bg-background/20" />
            </div>
          </div>

          {/* Image — desktop only (marketing graphic has baked-in text) */}
          <div className="relative hidden lg:block order-2">
            <Image
              src="/hero-brand.jpg"
              alt="Chef using a Shimeru Japanese knife"
              width={1200}
              height={742}
              priority
              sizes="50vw"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Bleed-fade into text column */}
            <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-foreground to-transparent z-10" />
          </div>
        </div>
      </section>

      {/* =============================================================
          2 · TRUST BAR — Horizontal, compact, icon-free
          ============================================================= */}
      <section className="border-b border-border">
        <div className="container mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {[
              { stat: "60+", label: "HRC Japanese Steel" },
              { stat: "Free", label: "US Shipping, Every Order" },
              { stat: "60", label: "Day Returns Policy" },
              { stat: "24h", label: "Email Support Reply" },
            ].map((item) => (
              <div key={item.label} className="py-5 sm:py-6 px-4 sm:px-6 text-center">
                <span className="font-serif text-2xl sm:text-3xl font-light text-primary">{item.stat}</span>
                <p className="text-[11px] sm:text-xs tracking-[0.15em] uppercase text-muted-foreground mt-1.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =============================================================
          3 · LATEST ARRIVALS — Product grid
          ============================================================= */}
      <section className="container mx-auto px-5 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-2">New In</p>
            <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.8rem)] font-light leading-tight">
              Latest Arrivals
            </h2>
          </div>
          <Link
            href="/product"
            className="text-[12px] tracking-[0.15em] uppercase text-primary hover:underline underline-offset-4 transition-colors"
          >
            View All &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 lg:gap-7">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {/* See All CTA */}
        <div className="mt-14 lg:mt-20 flex flex-col items-center gap-6">
          <div className="w-px h-10 bg-border" />
          <Link
            href="/product"
            className="group inline-flex items-center gap-3 border border-foreground/15 px-10 py-4 text-[12px] tracking-[0.25em] uppercase font-semibold hover:bg-foreground hover:text-background transition-all duration-300"
          >
            See All Knives
            <span className="inline-block translate-x-0 group-hover:translate-x-1 transition-transform duration-300">&rarr;</span>
          </Link>
        </div>
      </section>

      {/* =============================================================
          4 · WHY JAPANESE STEEL — Oversized numerals as visual anchors
          ============================================================= */}
      <section className="bg-foreground text-background relative overflow-hidden grain">
        <div className="container mx-auto px-5 lg:px-8 py-20 lg:py-32 relative z-10">
          <div className="text-center mb-16 lg:mb-24">
            <p className="text-xs tracking-[0.4em] uppercase text-background/45 mb-5">
              The Difference
            </p>
            <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.8rem)] font-light leading-tight">
              Why Japanese Steel Matters
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px">
            {[
              {
                num: "15°",
                title: "Edge Angle",
                body: "Western knives use 20–25°. A thinner Japanese edge gives cleaner cuts with noticeably less effort.",
                vs: "vs 20–25° Western",
              },
              {
                num: "60+",
                title: "HRC Hardness",
                body: "Harder steel holds its edge 2–3× longer than standard kitchen knives. Less sharpening, more cooking.",
                vs: "vs 54–58 Western",
              },
              {
                num: "67",
                title: "Layers of Damascus",
                body: "Folded steel creates a striking wave pattern while adding strength and corrosion resistance.",
                vs: "folded steel layers",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="text-center px-6 lg:px-10 py-12 lg:py-16 border-background/[0.06] first:border-l-0 md:[&:not(:first-child)]:border-l"
              >
                <span className="font-serif text-[clamp(4rem,8vw,7rem)] font-light leading-none text-primary block mb-2">
                  {item.num}
                </span>
                <p className="text-xs tracking-[0.25em] uppercase text-background/40 mb-6">
                  {item.vs}
                </p>
                <h3 className="text-base font-semibold tracking-wide text-background/90 mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-background/55 leading-[1.7] max-w-[18rem] mx-auto">
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center mt-14 lg:mt-20">
            <Link
              href="/product"
              className="inline-block border border-background/20 px-8 py-3.5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:bg-background/[0.07] transition-colors"
            >
              Explore the Range
            </Link>
          </div>
        </div>
      </section>

      {/* =============================================================
          5 · SHOP BY STYLE — Category grid with hairline borders
          ============================================================= */}
      <section className="container mx-auto px-5 lg:px-8 py-20 lg:py-28">
        <div className="text-center mb-14">
          <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-2">
            Find Your Knife
          </p>
          <h2 className="font-serif text-[clamp(1.8rem,3.5vw,2.8rem)] font-light">
            Shop by Style
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {[
            { name: "Gyuto", tag: "Most Popular", desc: "The Japanese chef knife — a versatile all-rounder for every task.", href: "/product?category=gyuto" },
            { name: "Santoku", tag: "Best for Beginners", desc: "Three virtues: slicing, dicing, mincing. The home cook's best friend.", href: "/product?category=santoku" },
            { name: "Nakiri", tag: "Vegetable Specialist", desc: "Flat blade, clean push-cuts. Purpose-built for vegetables.", href: "/product?category=nakiri" },
            { name: "Kiritsuke", tag: "Statement Piece", desc: "Commanding presence with a distinctive clipped tip and serious performance.", href: "/product?category=kiritsuke" },
            { name: "Bunka", tag: "Compact & Versatile", desc: "Agile with a reverse-tanto tip — excels at precision work.", href: "/product?category=bunka" },
            { name: "All Knives", tag: "Full Collection", desc: "Browse every Japanese kitchen knife and accessory we offer.", href: "/product" },
          ].map((cat) => (
            <Link
              key={cat.name}
              href={cat.href}
              className="group bg-background p-8 lg:p-10 hover:bg-accent/50 transition-colors duration-300 relative"
            >
              <p className="text-[11px] tracking-[0.35em] uppercase text-primary mb-3">{cat.tag}</p>
              <h3 className="font-serif text-2xl lg:text-3xl font-light mb-2 group-hover:text-primary transition-colors duration-300">
                {cat.name}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed pr-6">
                {cat.desc}
              </p>
              <span className="absolute bottom-8 right-8 lg:bottom-10 lg:right-10 text-primary opacity-0 group-hover:opacity-100 translate-x-[-6px] group-hover:translate-x-0 transition-all duration-300 text-lg">
                &rarr;
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* =============================================================
          6 · TRUST POINTS — Warm full-width, numbered trust points
          ============================================================= */}
      <section className="bg-warm">
        <div className="container mx-auto px-5 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl mx-auto text-center mb-14 lg:mb-20">
            <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-5">
              Buy With Confidence
            </p>
            <h2 className="font-serif text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.1]">
              Designed for Perfection.<br />
              Crafted the Japanese Way.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
            {[
              { num: "01", title: "Curated From Japan", desc: "Every knife hand-selected from trusted forges and partners in Japan." },
              { num: "02", title: "Full Buyer Protection", desc: "Secure Stripe checkout. 60-day hassle-free returns." },
              { num: "03", title: "Fast US Delivery", desc: "Free shipping on every order. Most dispatched within 24 hours." },
              { num: "04", title: "Knife Care Resources", desc: "Sharpening guides, care tips, and ongoing support to keep your knife performing." },
            ].map((point) => (
              <div key={point.num}>
                <span className="font-serif text-4xl lg:text-5xl font-light text-primary/30 block mb-3">{point.num}</span>
                <div className="w-8 h-px bg-primary/40 mb-4" />
                <p className="text-base font-semibold mb-1.5">{point.title}</p>
                <p className="text-sm text-muted-foreground leading-[1.7]">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =============================================================
          7 · GIFT — Centred editorial with occasion tags
          ============================================================= */}
      <section className="border-t border-border">
        <div className="container mx-auto px-5 lg:px-8 py-20 lg:py-28">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
              The Gift They&apos;ll Actually Use
            </p>
            <h2 className="font-serif text-[clamp(2rem,4vw,3.2rem)] font-light leading-[1.1] mb-5">
              Presentation-Ready<br />
              for Any Occasion
            </h2>
            <p className="text-base text-muted-foreground leading-[1.7] max-w-md mx-auto">
              Every Shimeru knife ships in a premium gift box — ready to
              impress, straight out of the box.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {["Birthdays", "Housewarmings", "Weddings", "Christmas", "Treat Yourself", "First Home"].map((occasion) => (
              <span
                key={occasion}
                className="border border-border px-5 py-2.5 text-xs tracking-[0.18em] uppercase text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-default"
              >
                {occasion}
              </span>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/product"
              className="inline-block bg-foreground text-background px-8 py-3.5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:opacity-90 transition-opacity"
            >
              Shop Gift-Ready Knives
            </Link>
          </div>
        </div>
      </section>

      {/* =============================================================
          8 · KNIFE GUIDE CTA — Dark, centred, commanding
          ============================================================= */}
      <section className="bg-warm relative overflow-hidden grain">
        <div className="container mx-auto px-5 lg:px-8 py-24 lg:py-32 text-center relative z-10">
          <p className="text-xs tracking-[0.4em] uppercase text-muted-foreground mb-5">
            Not Sure Where to Start?
          </p>
          <h2 className="font-serif text-[clamp(2rem,4.5vw,3.8rem)] font-light leading-[1.08] mb-5">
            Find Your Perfect Knife
          </h2>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-[1.7] mb-10">
            Answer a few quick questions and we&apos;ll recommend the right
            knife for your cooking style and experience level.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/knife-guide"
              className="bg-primary text-primary-foreground px-8 py-3.5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:opacity-90 transition-opacity"
            >
              Take the Quiz
            </Link>
            <Link
              href="/product?category=gyuto"
              className="border border-foreground/20 px-8 py-3.5 text-[12px] tracking-[0.2em] uppercase font-semibold hover:bg-foreground/[0.05] transition-colors"
            >
              Shop Gyuto &mdash; Our #1 Pick
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
