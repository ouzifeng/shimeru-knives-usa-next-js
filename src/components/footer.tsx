import Link from "next/link";
import { storeConfig } from "../../store.config";
import { EcommanderBadge } from "./ecommander-badge";

export function Footer() {
  return (
    <footer className="bg-foreground text-background/80 mt-0">
      <div className="container mx-auto px-4 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <h3 className="font-serif text-2xl font-semibold text-background mb-3">
              {storeConfig.name}
            </h3>
            <p className="text-base leading-relaxed text-background/60 max-w-xs">
              Japanese chef knives for the home cook who values precision,
              balance, and the joy of cooking with a blade that cuts properly.
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-[13px] tracking-[0.25em] uppercase text-background/50 mb-5">Shop</h4>
            <ul className="space-y-3 text-base">
              <li><Link href="/product" className="hover:text-background transition-colors">All Knives</Link></li>
              <li><Link href="/product?category=gyuto" className="hover:text-background transition-colors">Gyuto</Link></li>
              <li><Link href="/product?category=santoku" className="hover:text-background transition-colors">Santoku</Link></li>
              <li><Link href="/product?sort=newest" className="hover:text-background transition-colors">New Arrivals</Link></li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="text-[13px] tracking-[0.25em] uppercase text-background/50 mb-5">Help</h4>
            <ul className="space-y-3 text-base">
              <li><Link href="/contact" className="hover:text-background transition-colors">Contact Us</Link></li>
              <li><Link href="/shipping-and-delivery" className="hover:text-background transition-colors">Shipping &amp; Delivery</Link></li>
              <li><Link href="/refund_returns" className="hover:text-background transition-colors">Returns &amp; Refunds</Link></li>
              <li><Link href="/knife-care" className="hover:text-background transition-colors">Knife Care Guide</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-[13px] tracking-[0.25em] uppercase text-background/50 mb-5">Legal</h4>
            <ul className="space-y-3 text-base">
              <li><Link href="/privacy-policy" className="hover:text-background transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms-and-conditions" className="hover:text-background transition-colors">Terms &amp; Conditions</Link></li>
            </ul>
          </div>
        </div>

        {/* Store reviews */}
        <div className="border-t border-background/10 mt-14 pt-8 flex justify-center">
          <EcommanderBadge />
        </div>

        <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-background/30">
            &copy; {new Date().getFullYear()} {storeConfig.name}. All rights reserved.
          </p>
          <p className="text-xs text-background/30">
            Precision. Balance. Craft.
          </p>
        </div>
      </div>
    </footer>
  );
}
