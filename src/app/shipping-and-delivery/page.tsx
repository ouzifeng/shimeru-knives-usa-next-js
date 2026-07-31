import type { Metadata } from "next";
import { DeliveryEstimate } from "@/components/delivery-estimate";
import {
  DELIVERY_BANDS,
  DELIVERY_BAND_ORDER,
  DELIVERY_STATES,
} from "@/content/delivery-estimates";

export const metadata: Metadata = {
  title: "Shipping and Delivery",
  description: "Free standard US shipping on all orders. Shipped from our US warehouse.",
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
            Standard Shipping: 1–5 business days
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Free on all orders</li>
            <li>Shipped from our warehouse in Bolingbrook, Illinois</li>
            <li>Tracking numbers provided via email</li>
            <li>Delivery may take longer for remote locations</li>
          </ul>
          <div className="mt-5">
            <DeliveryEstimate />
          </div>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">
            Delivery Times by State
          </h2>
          <p className="mb-4">
            Because we ship from Illinois, delivery time depends on how far your state is from
            our warehouse. These are estimates, not guaranteed dates.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium text-foreground">Estimated delivery</th>
                  <th className="py-2 font-medium text-foreground">States</th>
                </tr>
              </thead>
              <tbody>
                {DELIVERY_BAND_ORDER.map((key) => (
                  <tr key={key} className="border-b border-border/50 align-top">
                    <td className="py-3 pr-4 whitespace-nowrap">{DELIVERY_BANDS[key].label}</td>
                    <td className="py-3">
                      {DELIVERY_STATES.filter((s) => s.band === key)
                        .map((s) => s.name)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Estimates assume in-stock items and same-day processing for orders placed before 1pm
            CT. Our warehouse dispatches Monday to Friday, so orders placed on Friday afternoon or
            over the weekend leave on the following Monday. Our carriers do deliver on Saturdays.
            Alaska and Hawaii fall outside some carrier networks and can take longer than the
            estimate shown.
          </p>
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
