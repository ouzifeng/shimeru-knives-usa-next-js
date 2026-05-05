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
            <a href="mailto:sales@shimeruknives.us" className="underline underline-offset-2 hover:text-foreground">
              sales@shimeruknives.us
            </a>
          </p>
          <p className="text-sm text-foreground/80">
            <span className="font-medium">Phone:</span>{" "}
            <a href="tel:+13343098138" className="underline underline-offset-2 hover:text-foreground">
              +1 (334) 309-8138
            </a>
          </p>
        </div>

        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
          Our Addresses
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
              UK Office
            </p>
            <p className="text-sm text-foreground/80">
              Kemp House, 152–160 City Road<br />
              London, EC1V 2NX<br />
              United Kingdom
            </p>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
              US Fulfillment
            </p>
            <p className="text-sm text-foreground/80">
              InSync Fulfillment C/O Shimeru Knives<br />
              1115 Hosler Dr<br />
              Bolingbrook, IL 60490<br />
              United States
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
