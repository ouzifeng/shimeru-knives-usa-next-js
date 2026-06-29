// Full text of the US affiliate agreement, shared by the tokenless preview
// (/affiliate/agreement) and the per-affiliate signing page
// (/affiliate/agreement/[token]) so the wording can never drift between them.
// Source of truth mirrored in docs/affiliate-agreement-us.md.

// TODO: confirm the US legal entity name + address and the governing state.
const COMPANY = "Shimeru Knives (US)";

export interface AffiliateAgreementBodyProps {
  /** When provided, the affiliate party line is filled in. Otherwise placeholders show. */
  affiliate?: { name: string; channel?: string | null; country?: string | null };
}

export function AffiliateAgreementBody({ affiliate }: AffiliateAgreementBodyProps) {
  return (
    <>
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-3">
        Shimeru Knives Affiliate Agreement (US)
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        This Agreement takes effect on the date you accept it (the &ldquo;Effective Date&rdquo;).
      </p>

      <div className="text-sm leading-relaxed text-foreground/80 space-y-6">
        <section className="space-y-2">
          <p>This Affiliate Agreement (&ldquo;Agreement&rdquo;) is made between:</p>
          <p>
            <strong>1. {COMPANY}</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;,
            the &ldquo;Company&rdquo;); and
          </p>
          {affiliate ? (
            <p>
              <strong>2. {affiliate.name}</strong>
              {affiliate.channel ? `, ${affiliate.channel}` : ""}
              {affiliate.country ? ` (${affiliate.country})` : ""} (&ldquo;you&rdquo;, the
              &ldquo;Affiliate&rdquo;).
            </p>
          ) : (
            <p>
              <strong>2. [Affiliate Full Name / Business Name]</strong> of [Affiliate Address], with
              primary promotional channel [@handle / URL] (&ldquo;you&rdquo;, the
              &ldquo;Affiliate&rdquo;).
            </p>
          )}
          <p>Together the &ldquo;Parties&rdquo;.</p>
        </section>

        <Section n="1" title="Appointment">
          <p>
            1.1 We appoint you as a <strong>non-exclusive</strong> affiliate to promote our products
            in return for commission on qualifying sales, on the terms below.
          </p>
          <p>
            1.2 This appointment is non-exclusive. You may promote other brands, including competing
            knife brands, provided you comply with Sections 4, 10 and 11.
          </p>
          <p>
            1.3 Nothing in this Agreement creates any employment, partnership, agency or joint
            venture between the Parties. You are an independent contractor (Section 16).
          </p>
        </Section>

        <Section n="2" title="Definitions">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Affiliate Link / Code:</strong> the unique referral code and/or tracking link
              we issue to you.
            </li>
            <li>
              <strong>Qualifying Sale:</strong> a completed, paid order placed on a Company website
              where the customer arrived via your Affiliate Link or applied your Code, and which is
              not subsequently refunded, charged back or cancelled.
            </li>
            <li>
              <strong>Attribution Window:</strong> the 30-day last-click period described in Section 5.
            </li>
            <li>
              <strong>Net Product Value:</strong> the price paid for products in a Qualifying Sale
              after any discounts or promo codes, and excluding sales tax, shipping and any
              gift-wrapping or surcharges.
            </li>
            <li>
              <strong>Content:</strong> any photos, video, text, audio or other material you create
              that features, references or promotes us or our products.
            </li>
          </ul>
        </Section>

        <Section n="3" title="Your appointment and the portal">
          <p>
            3.1 On approval we issue you an Affiliate Code and a secure portal link where you can
            view clicks, sales, commission status and upload Content, and provide your bank details
            for payment.
          </p>
          <p>
            3.2 You are responsible for keeping your portal link confidential. It grants access to
            your account.
          </p>
        </Section>

        <Section n="4" title="Your obligations">
          <p>You agree to:</p>
          <p>
            4.1 Promote our products honestly and only make claims that are accurate and that we
            have approved or that are demonstrably true;
          </p>
          <p>
            4.2 Clearly and conspicuously disclose the material connection between us in line with
            the FTC&rsquo;s Guides Concerning the Use of Endorsements and Testimonials in Advertising
            (e.g. &ldquo;#ad&rdquo;, &ldquo;paid partnership&rdquo;, or equivalent clear and prominent
            labeling) on every piece of paid or incentivized Content;
          </p>
          <p>4.3 Follow any brand guidelines, asset packs and reasonable instructions we provide;</p>
          <p>
            4.4 Only use marketing materials, images and trademarks we supply or approve, and stop
            using them on request;
          </p>
          <p>4.5 Not make any representation, warranty or commitment on our behalf.</p>
        </Section>

        <Section n="5" title="Tracking and attribution">
          <p>
            5.1 Qualifying Sales are tracked by your Affiliate Code and a 30-day last-click cookie:
            commission is attributed to the most recent affiliate whose link/code the customer used
            within 30 days before purchase.
          </p>
          <p>
            5.2 We may use reasonable technical means to detect invalid, fraudulent or
            self-generated activity. Our records of clicks, sales and commission, generated by our
            systems, are the definitive record absent manifest error.
          </p>
        </Section>

        <Section n="6" title="Commission">
          <p>
            6.1 We will pay you commission of <strong>20%</strong> of the Net Product Value of each
            Qualifying Sale, unless a different rate is agreed in writing for your account.
          </p>
          <p>
            6.2 Commission is not payable on sales tax, shipping, refunded or cancelled items, or
            orders that breach this Agreement.
          </p>
          <p>
            6.3 We may change the commission rate on 30 days&rsquo; written notice. The change
            applies only to sales made after it takes effect.
          </p>
        </Section>

        <Section n="7" title="Payment">
          <p>
            7.1 <strong>Refund hold.</strong> Each commission is held as &ldquo;pending&rdquo; for a
            14-day refund window from the order date, then becomes &ldquo;approved&rdquo; if the
            order has not been refunded, charged back or cancelled.
          </p>
          <p>
            7.2 <strong>Payout schedule.</strong> We pay approved commission monthly, with no minimum
            payout threshold, to the bank account you provide in the portal. You must provide valid,
            accurate bank details; we are not liable for payments delayed or lost due to incorrect
            details.
          </p>
          <p>
            7.3 <strong>Clawback / reversal.</strong> If an order is later refunded, charged back,
            cancelled, or found to be fraudulent or in breach of this Agreement, the related
            commission is reversed. If it has already been paid, we may offset it against future
            commission or invoice you for it.
          </p>
          <p>
            7.4 <strong>Tax.</strong> You are solely responsible for all taxes on your commission. We
            may require a completed Form W-9 before payment and may issue a Form 1099 where required.
            You are not our employee for tax purposes.
          </p>
        </Section>

        <Section n="8" title="Content license">
          <p>
            8.1 You grant us a <strong>perpetual, irrevocable, worldwide, royalty-free,
            sub-licensable and transferable license</strong> to use, reproduce, edit, adapt, crop,
            re-format, publish, display and distribute your Content, in whole or part, across all
            media now known or later devised, including organic and paid advertising (e.g. Meta,
            TikTok, Google, YouTube), our websites, email, and in-store/print materials.
          </p>
          <p>
            8.2 We may use your Content with or without crediting you, and may combine it with other
            material. We will not materially misrepresent your views.
          </p>
          <p>
            8.3 You represent and warrant that you own or have cleared all rights in your Content,
            including any music, third-party footage, locations and the rights of any people
            appearing in it, and that our use under Section 8.1 will not infringe any third
            party&rsquo;s rights or breach any platform terms.
          </p>
          <p>8.4 This license survives termination of this Agreement.</p>
        </Section>

        <Section n="9" title="Intellectual property">
          <p>
            9.1 We own all rights in our trademarks, logos, product designs, images and brand assets
            (&ldquo;Company IP&rdquo;). We grant you a limited, non-exclusive, revocable license to
            use Company IP solely to promote us under this Agreement and in line with our guidelines.
          </p>
          <p>
            9.2 You acquire no other rights in Company IP. All goodwill from your use of it accrues
            to us.
          </p>
        </Section>

        <Section n="10" title="Prohibited activities">
          <p>You must not:</p>
          <p>
            10.1 Bid on, or use in paid search, our brand names, trademarks or common misspellings,
            or direct paid-search traffic to your Affiliate Link;
          </p>
          <p>
            10.2 Promote your Code through coupon, voucher, cashback or incentive-traffic sites
            without our prior written consent;
          </p>
          <p>
            10.3 Generate clicks or sales by self-purchase, automated means, cookie-stuffing, spam,
            or any deceptive or artificial method;
          </p>
          <p>
            10.4 Use unsolicited email/SMS (in violation of the CAN-SPAM Act, TCPA or similar) or
            post on platforms in breach of their terms;
          </p>
          <p>
            10.5 Register domains, social handles or accounts that imply you are us or are officially
            operated by us.
          </p>
        </Section>

        <Section n="11" title="Compliance with law (including knife-specific duties)">
          <p>
            11.1 You will comply with all applicable laws and regulations, including the FTC
            Endorsement Guides and applicable federal and state consumer-protection and privacy laws.
          </p>
          <p>
            11.2 <strong>Age and safety.</strong> Our products are bladed articles that may only be
            sold to, and used by, adults. You must:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>not target, direct or knowingly distribute Content to minors;</li>
            <li>
              not depict or describe our products as weapons, or glamorize, encourage or promote
              violence or unsafe handling;
            </li>
            <li>present our products only in a lawful, responsible, culinary context; and</li>
            <li>
              acknowledge that all sales are subject to our age and delivery checks and to applicable
              federal, state and local knife laws, and that we may refuse or cancel any order on
              those grounds (with no commission due on a cancelled order).
            </li>
          </ul>
          <p>
            11.3 You will not bring us into disrepute. We may require you to remove or amend Content
            that breaches this Section.
          </p>
        </Section>

        <Section n="12" title="Confidentiality and data">
          <p>
            12.1 Each Party will keep the other&rsquo;s confidential information (including
            commercial terms, rates and non-public data) confidential and use it only for this
            Agreement.
          </p>
          <p>
            12.2 Where you process any personal data in connection with promotion, you will do so
            lawfully and will not add customers to your own marketing lists without their consent.
          </p>
        </Section>

        <Section n="13" title="Term and termination">
          <p>13.1 This Agreement continues until terminated.</p>
          <p>
            13.2 Either Party may terminate for convenience on 14 days&rsquo; written notice (email
            is sufficient).
          </p>
          <p>
            13.3 We may terminate or suspend immediately if you breach Sections 4, 8, 10 or 11,
            commit fraud, or act in a way likely to damage our reputation.
          </p>
          <p>
            13.4 On termination: your right to promote us and to use Company IP ends immediately; we
            will pay any commission already approved (and any pending commission that subsequently
            becomes approved) for legitimate Qualifying Sales before termination; and the content
            license in Section 8 survives (perpetual).
          </p>
        </Section>

        <Section n="14" title="Warranties and indemnity">
          <p>
            14.1 You represent and warrant that you will comply with this Agreement and all
            applicable law, and that your Content and promotional activity will not infringe any
            third-party rights.
          </p>
          <p>
            14.2 You will indemnify, defend and hold us harmless against losses, claims and
            reasonable costs (including attorneys&rsquo; fees) arising from your breach of this
            Agreement, your Content, or your promotional methods.
          </p>
        </Section>

        <Section n="15" title="Limitation of liability">
          <p>
            15.1 Nothing limits liability that cannot be limited by law (e.g. fraud or
            gross negligence).
          </p>
          <p>
            15.2 Subject to 15.1, our total liability to you under this Agreement is limited to the
            total commission paid or payable to you in the 6 months before the claim arose. We are
            not liable for loss of profit, anticipated earnings, goodwill or indirect, incidental or
            consequential damages.
          </p>
        </Section>

        <Section n="16" title="Independent contractor">
          <p>
            You act as an independent contractor on your own account. You are responsible for your
            own costs, equipment, taxes and insurance, and you are free to work with other brands
            subject to Section 1.2.
          </p>
        </Section>

        <Section n="17" title="General">
          <p>
            17.1 <strong>Assignment.</strong> We may assign or transfer this Agreement. You may not
            without our written consent.
          </p>
          <p>
            17.2 <strong>Entire agreement.</strong> This Agreement is the entire agreement between
            the Parties on its subject matter and supersedes prior discussions.
          </p>
          <p>
            17.3 <strong>Modification.</strong> We may update these terms on reasonable written
            notice; continued promotion after the notice period is acceptance. Any other modification
            must be in writing.
          </p>
          <p>
            17.4 <strong>Notices.</strong> Notices may be sent to the email addresses the Parties use
            to administer the program.
          </p>
          <p>
            17.5 <strong>Severability.</strong> If any provision is unenforceable, the rest remains
            in force.
          </p>
        </Section>

        <Section n="18" title="Governing law and jurisdiction">
          <p>
            This Agreement and any dispute arising from it are governed by the laws of the State of
            [US STATE], without regard to its conflict-of-laws rules, and the Parties submit to the
            exclusive jurisdiction of the state and federal courts located in [US STATE / COUNTY].
          </p>
        </Section>
      </div>
    </>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-medium text-foreground">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}
