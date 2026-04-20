import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Shimeru Knives brings authentic Japanese chef knives to home cooks who value precision, balance, and craftsmanship — without the premium markup.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-8">
        About Shimeru Knives
      </h1>

      <div className="prose prose-neutral max-w-none text-sm leading-relaxed text-foreground/80 space-y-5">
        <p>
          Shimeru Knives was founded with a simple idea: that every home cook deserves access to
          genuinely good Japanese knives without paying collector prices. We work directly with
          trusted forges and manufacturers in Japan and Mainland Asia to bring you knives that
          perform beautifully at a price that makes sense.
        </p>

        <p>
          Every knife we sell is hand-selected for its steel quality, edge geometry, balance, and
          handle comfort. We focus on the styles that matter most in a working kitchen — gyuto,
          santoku, nakiri, and kiritsuke — and we test each model before it joins our range.
        </p>

        <p>
          We are a registered business based in the United Kingdom with a US office in Wilmington,
          Delaware. All orders are fulfilled from our warehouses with tracked shipping, and our
          customer service team responds to every enquiry within 24 hours.
        </p>

        <h2 className="font-serif text-xl font-light tracking-tight pt-4">Our Promise</h2>

        <ul className="list-disc pl-5 space-y-2">
          <li>Genuine Japanese-style knives at honest prices</li>
          <li>Free shipping on every order</li>
          <li>30-day returns — no questions asked</li>
          <li>Responsive customer support via email and phone</li>
          <li>Secure checkout powered by Stripe</li>
        </ul>

        <h2 className="font-serif text-xl font-light tracking-tight pt-4">Contact Us</h2>

        <p>
          Have a question or need help choosing a knife? We are always happy to help.
        </p>
        <ul className="list-none pl-0 space-y-1">
          <li>
            <span className="font-medium">Email:</span>{" "}
            <a href="mailto:sales@shimeruknives.us" className="underline underline-offset-2">
              sales@shimeruknives.us
            </a>
          </li>
          <li>
            <span className="font-medium">Phone:</span>{" "}
            <a href="tel:+447494512699" className="underline underline-offset-2">
              +44 7494 512699
            </a>
          </li>
        </ul>

        <h2 className="font-serif text-xl font-light tracking-tight pt-4">Our Addresses</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="font-medium text-foreground mb-1">US Office</p>
            <p>
              1000 N West St, Suite 1200<br />
              Wilmington, DE 19801
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">UK Office</p>
            <p>
              Kemp House, 152-160 City Road<br />
              London, EC1V 2NX
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 pt-8 border-t border-border">
        <Link
          href="/contact"
          className="text-sm underline underline-offset-2 hover:text-foreground text-foreground/60"
        >
          Get in touch with us
        </Link>
      </div>
    </div>
  );
}
