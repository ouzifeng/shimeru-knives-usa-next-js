import type { CategoryFaq } from "@/content/category-seo";

// Collapsed "About these knives" disclosure that renders above the product
// grid. The summary line is one short row; the intro paragraph is hidden
// until the user clicks. Content inside <details> is indexed by Google
// normally (mobile-first indexing) so this gives the SEO weight without
// pushing products down on the page.
export function CategoryIntroDisclosure({
  label,
  intro,
}: {
  label: string;
  intro: string;
}) {
  return (
    <details className="group mt-4 max-w-2xl">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <span className="underline underline-offset-4 decoration-dotted">{label}</span>
        <span
          className="text-base leading-none transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <p className="mt-3 text-base text-muted-foreground leading-relaxed">{intro}</p>
    </details>
  );
}

export function CategorySeoBody({ body }: { body: string }) {
  return (
    <section className="border-t border-border bg-muted/20">
      <div className="container mx-auto px-4 lg:px-8 py-12 max-w-3xl">
        <p className="text-base text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </section>
  );
}

export function CategoryFaq({ faqs }: { faqs: CategoryFaq[] }) {
  if (!faqs.length) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <section className="border-t border-border">
      <div className="container mx-auto px-4 lg:px-8 py-12 lg:py-16 max-w-3xl">
        <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground mb-2">
          Common questions
        </p>
        <h2 className="font-serif text-3xl lg:text-4xl font-light mb-8">
          Frequently asked
        </h2>
        <div className="divide-y divide-border">
          {faqs.map((f) => (
            <details key={f.question} className="group py-5">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-6 font-medium text-base">
                <span>{f.question}</span>
                <span
                  className="shrink-0 mt-1 text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted-foreground leading-relaxed">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </section>
  );
}
