"use client";

import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCartStore } from "@/lib/cart-store";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/format";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  const { items, updateQuantity, removeItem, total } = useCartStore();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-[420px] p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-xs tracking-[0.3em] uppercase font-medium">
            Your Cart ({items.length})
          </SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5">
            <p className="font-serif text-lg text-muted-foreground">Your cart is empty</p>
            <button
              onClick={() => onOpenChange(false)}
              className="text-sm tracking-wide uppercase text-primary hover:underline underline-offset-4"
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5">
              <div className="divide-y divide-border">
                {items.map((item) => (
                  <div key={`${item.product.id}-${item.variationId}`} className="flex gap-4 py-5">
                    <div className="relative w-20 h-20 shrink-0 bg-muted overflow-hidden">
                      {item.product.images[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.product.images[0].src}
                          alt={item.product.images[0].alt || item.product.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex justify-between gap-2">
                        <p className="font-medium text-base leading-snug line-clamp-2">{item.product.name}</p>
                        <button
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0 -mr-2 -mt-1"
                          onClick={() => removeItem(item.product.id, item.variationId)}
                          aria-label={`Remove ${item.product.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatPrice(item.product.price)}
                      </p>
                      <div className="flex items-center justify-between mt-auto pt-2">
                        <div className="flex items-center border border-border">
                          <button
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors"
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.variationId)}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm w-7 text-center tabular-nums">{item.quantity}</span>
                          <button
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted transition-colors"
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.variationId)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-sm font-medium">
                          {formatPrice(item.product.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border px-5 py-5 space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-sm tracking-[0.2em] uppercase text-muted-foreground">Subtotal</span>
                <span className="text-xl font-medium">{formatPrice(total())}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Shipping and discounts calculated at checkout.
              </p>
              <Link
                href="/checkout"
                onClick={() => onOpenChange(false)}
                className="block w-full py-3.5 text-sm tracking-widest uppercase font-medium text-center bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                Checkout
              </Link>
              <button
                onClick={() => onOpenChange(false)}
                className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              >
                Continue Shopping
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
