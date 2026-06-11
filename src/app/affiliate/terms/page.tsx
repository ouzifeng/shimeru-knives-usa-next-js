import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Affiliate Program Terms",
  description: "Terms and conditions for the Shimeru Knives affiliate program.",
  alternates: { canonical: "/affiliate/terms" },
};

export default function AffiliateTermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-8">
        Affiliate Program Terms
      </h1>

      <div className="text-sm leading-relaxed text-foreground/80 space-y-6">
        <p className="text-muted-foreground">
          Placeholder draft. Final wording to be confirmed before launch.
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-medium text-foreground">1. Commission</h2>
          <p>
            Approved affiliates earn 20% commission on the product value (excluding shipping and
            tax, after any discounts) of each order placed through their unique referral link.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-medium text-foreground">2. Attribution</h2>
          <p>
            A sale is attributed to your link when a customer clicks it and completes a purchase
            within 30 days. The most recent affiliate link clicked is the one credited.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-medium text-foreground">3. Payouts</h2>
          <p>
            Commissions are confirmed after a 14-day period to allow for returns and refunds.
            Confirmed commissions are paid monthly to the bank details you provide. Commission on
            any order that is refunded or cancelled is reversed.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-medium text-foreground">4. Content licence</h2>
          <p>
            By joining the program you grant Shimeru Knives a non-exclusive, royalty-free,
            worldwide licence to use, reproduce, edit, and distribute the content you create in
            connection with the program (including photos and video) across our own channels and
            paid advertising, including Meta (Instagram and Facebook) ads, for the duration of your
            participation and for a reasonable period afterwards. We will credit you where
            practical. You confirm the content is your own and clears any third-party rights.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-medium text-foreground">5. Conduct</h2>
          <p>
            You may not bid on our brand terms in paid search, spam, or misrepresent our products.
            We may suspend or remove any affiliate at our discretion for breaching these terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-medium text-foreground">6. Approval</h2>
          <p>
            Acceptance into the program is at our discretion. Submitting an application does not
            guarantee approval.
          </p>
        </section>
      </div>
    </div>
  );
}
