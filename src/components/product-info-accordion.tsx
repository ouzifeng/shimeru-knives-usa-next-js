import type { ProductSpecs } from "@/lib/products";
import { ProductSpecsGrid } from "./product-specs";

function Row({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex items-center justify-between py-4 cursor-pointer list-none gap-4 min-h-[44px] [&::-webkit-details-marker]:hidden">
        <span className="text-sm tracking-[0.15em] uppercase font-medium">{label}</span>
        <span className="text-muted-foreground shrink-0 text-lg leading-none transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pb-5 text-base text-foreground/85 leading-relaxed">
        {children}
      </div>
    </details>
  );
}

export function ProductInfoAccordion({ specs }: { specs: ProductSpecs | null }) {
  return (
    <div className="border-t border-border divide-y divide-border">
      <Row label="All Knives Branded">
        <p>
          Every Shimeru knife is stamped with the Shimeru maker&apos;s mark on the blade. We
          photograph our knives unbranded so you can see the steel, the Damascus pattern and the
          finish in all their glory, but the knife that arrives at your door carries the Shimeru
          stamp.
        </p>
      </Row>

      <Row label="Free US Shipping">
        <p>
          Free standard US shipping (USPS, 3 to 5 business days) on all orders, or upgrade to Express
          (1 to 3 business days) for $5.99. Every order ships from our US warehouse.
        </p>
      </Row>

      <Row label="60-Day Free Returns">
        <p>
          Changed your mind? You have 60 days to return any unused, undamaged knife through our
          self-service{" "}
          <a href="/refund_returns" className="underline underline-offset-4 hover:text-foreground">
            Returns &amp; Refunds
          </a>{" "}
          portal. We&apos;ll refund you once it arrives back with us.
        </p>
      </Row>

      <Row label="Secure Payment">
        <p>
          Checkout is encrypted and processed securely by Stripe. Pay by card with confidence at
          checkout.
        </p>
      </Row>

      {specs && (
        <Row label="Product Details">
          <ProductSpecsGrid specs={specs} />
        </Row>
      )}

      <Row label="Knife Care">
        <img
          src="/knife-care.jpg"
          alt="Knife care guide: Rinse, Dry, Store"
          className="w-full rounded mb-5"
        />
        <div className="space-y-5">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-1">
              Step 1: Rinse
            </p>
            <p className="text-sm leading-relaxed">
              Warm water and mild soap after each use. Never put your knife in the dishwasher; the
              harsh detergents and jostling will damage the edge and handle.
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-1">
              Step 2: Dry
            </p>
            <p className="text-sm leading-relaxed">
              Towel dry immediately. Don&apos;t leave it wet or in the sink; even stainless steel can
              develop spots if left damp.
            </p>
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-1">
              Step 3: Store
            </p>
            <p className="text-sm leading-relaxed">
              Use a knife block, magnetic strip, or blade guard. Never toss it loose in a drawer; it
              dulls the edge and is a safety hazard.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-5 pt-5 border-t border-border">
          That&apos;s it. No special maintenance, no fussy rituals. Your Shimeru knife is designed for
          daily use, and with these three steps it&apos;ll stay razor-sharp for years.
        </p>
      </Row>

      <Row label="Arrives Boxed">
        <p>
          Every knife comes in its own presentation box, ready to give as a gift.
        </p>
      </Row>
    </div>
  );
}
