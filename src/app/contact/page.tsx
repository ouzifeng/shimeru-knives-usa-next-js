import type { Metadata } from "next";
import { ContactFormEmbed } from "@/components/contact-form-embed";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with Shimeru Knives. We aim to reply to all emails within 24 hours.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-4">
        Contact Us
      </h1>

      <div className="text-sm leading-relaxed text-foreground/80 space-y-4 mb-10">
        <p>
          Customer satisfaction is mission critical for us. We aim to reply to all emails within
          24 hours of receiving them.
        </p>
        <p>
          If you are looking to return an order, you can submit a return request through our{" "}
          <a href="/refund_returns" className="text-primary underline underline-offset-2 hover:text-primary/80">
            returns portal
          </a>. For anything else or help with an order, please include your order details below.
        </p>
      </div>

      <ContactFormEmbed />

      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
          Get In Touch
        </h2>
        <div className="space-y-2 mb-8">
          <p className="text-sm text-foreground/80">
            <span className="font-medium">Email:</span>{" "}
            <a href="mailto:sales@shimeruknives.com" className="underline underline-offset-2 hover:text-foreground">
              sales@shimeruknives.com
            </a>
          </p>
          <p className="text-sm text-foreground/80">
            <span className="font-medium">Phone:</span>{" "}
            <a href="tel:+447494512699" className="underline underline-offset-2 hover:text-foreground">
              +44 7494 512699
            </a>
          </p>
        </div>

        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
          Our Addresses
        </h2>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">US Office</p>
            <p className="text-sm text-foreground/80">
              1000 N West St, Suite 1200<br />
              Wilmington, DE 19801
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">UK Office</p>
            <p className="text-sm text-foreground/80">
              Kemp House, 152–160 City Road<br />
              London, EC1V 2NX
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
