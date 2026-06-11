import type { Metadata } from "next";
import { AffiliateApplyForm } from "@/components/affiliate-apply-form";
import { AffiliateUgcExamples } from "@/components/affiliate-ugc-examples";
import { ChevronDown } from "lucide-react";

export const metadata: Metadata = {
  title: "Become an Affiliate",
  description:
    "Join the Shimeru Knives affiliate program. Share the knives you love and earn 20% commission on every sale you refer.",
  alternates: { canonical: "/affiliate/apply" },
};

export default function AffiliateApplyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-4">
        Become an Affiliate
      </h1>

      <div className="text-sm leading-relaxed text-foreground/80 space-y-4 mb-10">
        <p>
          Love our knives and have an audience that would too? Join the Shimeru Knives affiliate
          program. You get your own link to share, and earn{" "}
          <span className="font-medium text-foreground">20% commission</span> on every order you
          refer, paid out monthly.
        </p>
        <p>
          Fill in the form below and we&apos;ll review your application. We review every applicant
          personally, so tell us a little about you and your channels.
        </p>
      </div>

      <details className="group mb-12 rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 list-none">
          <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
            See the kind of content we love
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 pt-1">
          <AffiliateUgcExamples />
        </div>
      </details>

      <AffiliateApplyForm />

      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
          How it works
        </h2>
        <ol className="text-sm text-foreground/80 space-y-2 list-decimal pl-4">
          <li>Apply using the form above.</li>
          <li>We review and, once approved, send you a personal affiliate link.</li>
          <li>Share your link on any product. We track every click and sale.</li>
          <li>Earn 20% on every referred order, paid to your bank monthly.</li>
        </ol>
      </div>
    </div>
  );
}
