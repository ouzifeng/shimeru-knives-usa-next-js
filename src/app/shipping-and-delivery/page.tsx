import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shipping and Delivery",
  description: "Free standard US shipping on all orders. Express shipping available. Shipped from our US warehouse.",
};

export default function ShippingPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-10">
        Shipping and Delivery
      </h1>

      <div className="prose-sm space-y-8 text-sm leading-relaxed text-foreground/80">
        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            Standard Shipping: 3–5 business days
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Free on all orders</li>
            <li>Shipped from our US warehouse</li>
            <li>Tracking numbers provided via email</li>
            <li>Delivery may take longer for remote locations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            Express Shipping: 1–3 business days — $5.99
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Available at checkout</li>
            <li>Shipped from our US warehouse</li>
            <li>Tracking numbers provided via email</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">International Shipping</h2>
          <p>
            We can ship to other international locations, please{" "}
            <a href="/contact" className="text-primary underline underline-offset-2 hover:text-primary/80">
              contact us
            </a>{" "}
            for shipping times and costs.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">Processing Times</h2>
          <p>
            We aim to ship our orders in the fastest time possible. Orders placed before 1pm CT on a
            business day are dispatched the same day. All orders are shipped during working hours
            Mon–Fri (not including federal holidays). Please allow longer shipping times during
            extremely busy periods, e.g. Christmas.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">Please Note</h2>
          <p>
            We are not responsible for delays that are out of our hands or wrongly inputted
            addresses. Shipping times are estimates for major locations within the contiguous US.
            Other locations may have slightly longer shipping times.
            All orders are shipped from our US warehouse.
          </p>
        </section>
      </div>
    </div>
  );
}
