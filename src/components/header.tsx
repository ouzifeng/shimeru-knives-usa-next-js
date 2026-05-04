"use client";

import Link from "next/link";
import { ShoppingCart, Search, Menu, X } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { CartSheet } from "./cart-sheet";
import { useState, useEffect } from "react";
import { storeConfig } from "../../store.config";
import { Logo } from "./logo";
import { SearchOverlay } from "./search-overlay";

export function Header() {
  const itemCount = useCartStore((s) => s.itemCount());
  const cartOpen = useCartStore((s) => s.cartOpen);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change (resize)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  return (
    <>
      {/* Announcement bar */}
      <div className="bg-foreground text-background text-xs tracking-[0.2em] text-center py-2.5 uppercase font-medium">
        Free US Shipping on All Orders
      </div>

      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex h-16 lg:h-18 items-center justify-between">
            {/* Left: mobile menu toggle */}
            <div className="flex items-center gap-2 w-24 lg:w-auto">
              <button
                className="lg:hidden p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>

            {/* Center: Logo */}
            <Link href="/">
              <Logo />
            </Link>

            {/* Right: icons */}
            <div className="flex items-center gap-1 w-24 lg:w-auto justify-end">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-primary transition-colors"
                aria-label="Search products"
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-primary transition-colors relative"
                onClick={() => setCartOpen(true)}
                aria-label={`Cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
              >
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium leading-none">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Desktop nav — below logo row */}
          <nav className="hidden lg:flex items-center justify-center gap-8 pb-3 -mt-1">
            {[
              { href: "/product", label: "Shop All" },
              { href: "/product?category=gyuto", label: "Gyuto" },
              { href: "/product?category=santoku", label: "Santoku" },
              { href: "/product?category=nakiri", label: "Nakiri" },
              { href: "/product?category=kiritsuke", label: "Kiritsuke" },
              { href: "/product?category=japanese-breadknife", label: "Bread Knife" },
              { href: "/product?category=knife-sets", label: "Knife Sets" },
              { href: "/product?on_sale=true", label: "Sale" },
              { href: "/knife-guide", label: "Knife Guide" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[13px] tracking-[0.15em] uppercase transition-colors ${link.label === "Sale" ? "text-red-600 hover:text-red-700 font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="fixed inset-y-0 left-0 w-[280px] bg-background z-50 lg:hidden overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <img src="/logo.png" alt={storeConfig.name} className="h-8 w-auto" />
              <button
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {[
                { href: "/product", label: "Shop All" },
                { href: "/product?category=gyuto", label: "Gyuto" },
                { href: "/product?category=santoku", label: "Santoku" },
                { href: "/product?category=nakiri", label: "Nakiri" },
                { href: "/product?category=kiritsuke", label: "Kiritsuke" },
                { href: "/product?category=japanese-breadknife", label: "Bread Knife" },
                { href: "/product?category=knife-sets", label: "Knife Sets" },
                { href: "/product?on_sale=true", label: "Sale" },
                { href: "/knife-guide", label: "Knife Guide" },
                { href: "/blog", label: "Blog" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block text-sm tracking-wide uppercase py-3 px-2 transition-colors border-b border-border/50 ${link.label === "Sale" ? "text-red-600 hover:text-red-700 font-medium" : "hover:text-primary"}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="p-4 mt-4 space-y-1 border-t border-border">
              {[
                { href: "/contact", label: "Contact Us" },
                { href: "/shipping-and-delivery", label: "Shipping Info" },
                { href: "/knife-care", label: "Knife Care" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-muted-foreground py-2.5 px-2 hover:text-foreground transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
