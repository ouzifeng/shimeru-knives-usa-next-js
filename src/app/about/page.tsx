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
          Shimeru Knives is a UK retailer of Japanese-style chef knives, established in 2023 by
          David Oak. We started in the United Kingdom selling to home cooks at{" "}
          <a href="https://shimeruknives.co.uk" className="underline underline-offset-2">
            shimeruknives.co.uk
          </a>
          , and launched in the United States in 2026 to bring the same range to North American
          kitchens.
        </p>

        <p>
          Our idea is simple: every home cook deserves access to genuinely good Japanese knives
          without paying collector prices. We work directly with trusted forging partners in Asia
          to source knives built to authentic Japanese geometry — high-hardness steel, thin edges,
          balanced handles — at a price that makes sense for everyday cooking.
        </p>

        <p>
          Every knife we sell is hand-selected for its steel quality, edge geometry, balance, and
          handle comfort. We focus on the styles that matter most in a working kitchen — gyuto,
          santoku, nakiri, and kiritsuke — and we test each model before it joins our range.
        </p>

        <p>
          US orders are picked, packed and shipped from our fulfillment partner in Bolingbrook,
          Illinois, with tracked USPS shipping typically dispatched within 24 hours. Our customer
          service team responds to every enquiry within 24 hours.
        </p>

        <h2 className="font-serif text-xl font-light tracking-tight pt-4">A Note From the Founder</h2>

        <p>
          Hi, I&apos;m David Oak — I started Shimeru Knives in 2023 after years of buying,
          using and re-sharpening cheap kitchen knives that never quite cut the way I wanted
          them to. I tried a Japanese gyuto, never looked back, and started Shimeru to bring
          the same knives to home cooks at honest prices. If you ever have a question about a
          knife, the steel, sharpening, or your order, I personally read every email that
          comes into our support inbox.
        </p>

        <h2 className="font-serif text-xl font-light tracking-tight pt-4">Our Promise</h2>

        <ul className="list-disc pl-5 space-y-2">
          <li>Genuine Japanese-style knives at honest prices</li>
          <li>Free shipping on every order</li>
          <li>60-day returns — no questions asked</li>
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
            <a href="mailto:sales@shimeruknives.co.uk" className="underline underline-offset-2">
              sales@shimeruknives.co.uk
            </a>
          </li>
          <li>
            <span className="font-medium">Phone:</span>{" "}
            <a href="tel:+13343098138" className="underline underline-offset-2">
              +1 (334) 309-8138
            </a>
          </li>
        </ul>

        <h2 className="font-serif text-xl font-light tracking-tight pt-4">Our Addresses</h2>

        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-foreground/50 mb-2">
              UK Correspondence
            </p>
            <p>
              Shimeru Knives<br />
              Kemp House, 152–160 City Road<br />
              London, EC1V 2NX<br />
              United Kingdom
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-foreground/50 mb-2">
              US Fulfillment
            </p>
            <p>
              InSync Fulfillment C/O Shimeru Knives<br />
              1115 Hosler Dr<br />
              Bolingbrook, IL 60490<br />
              United States
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
