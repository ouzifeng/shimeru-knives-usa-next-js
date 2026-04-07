import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "./types";

export interface CartItem {
  product: Product;
  quantity: number;
  variationId?: number;
}

interface CartStore {
  items: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addItem: (product: Product, quantity?: number, variationId?: number) => void;
  removeItem: (productId: number, variationId?: number) => void;
  updateQuantity: (productId: number, quantity: number, variationId?: number) => void;
  clearCart: () => void;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartOpen: false,
      setCartOpen: (open) => set({ cartOpen: open }),

      addItem: (product, quantity = 1, variationId) => {
        set((state) => {
          // For variable products, match on variationId too
          const existing = state.items.find(
            (i) => i.product.id === product.id && i.variationId === variationId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product.id === product.id && i.variationId === variationId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, { product, quantity, variationId }] };
        });
        set({ cartOpen: true });

        // Funnel tracking
        import("./funnel").then(({ trackFunnelEvent }) => {
          trackFunnelEvent("add_to_cart", {
            product_id: product.id,
            product_name: product.name,
            cart_value: product.price * quantity,
          });
        }).catch(() => {});
      },

      removeItem: (productId, variationId) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.product.id === productId && i.variationId === variationId)
          ),
        }));
      },

      updateQuantity: (productId, quantity, variationId) => {
        if (quantity <= 0) {
          get().removeItem(productId, variationId);
          return;
        }
        // Cap at 99
        const qty = Math.min(quantity, 99);
        set((state) => ({
          items: state.items.map((i) =>
            i.product.id === productId && i.variationId === variationId
              ? { ...i, quantity: qty }
              : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0
        ),

      itemCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: "wc-cart", partialize: (state) => ({ items: state.items }) }
  )
);
