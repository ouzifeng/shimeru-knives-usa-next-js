import type { Metadata } from "next";
import { AffiliateAgreementBody } from "@/components/affiliate-agreement-body";

// Unlisted preview of the full affiliate agreement for review. Not linked from
// anywhere and excluded from search engines. The per-affiliate signable version
// lives at /affiliate/agreement/[token].
export const metadata: Metadata = {
  title: "Affiliate Agreement (Draft Preview)",
  robots: { index: false, follow: false },
};

export default function AffiliateAgreementPreviewPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <div className="mb-8 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Draft preview, not legal advice.</strong> Internal review copy. Have an attorney
        review Sections 8 (Content License) and 11 (Compliance), and set the governing state, before
        use. Affiliates sign their own copy at <code>/affiliate/agreement/&lt;their-token&gt;</code>.
      </div>

      <AffiliateAgreementBody />

      <section className="space-y-2 pt-6 mt-6 border-t border-border text-sm leading-relaxed text-foreground/80">
        <h2 className="text-base font-medium text-foreground">Acceptance</h2>
        <p>
          By checking the affiliate license/terms box at sign-up, or by signing the agreement sent to
          you, you confirm you have read, understood and agree to this Agreement.
        </p>
      </section>
    </div>
  );
}
