"use client";

import { useRecentlyViewed } from "./recently-viewed";
import type { Product } from "@/lib/types";

export function RecentlyViewedTracker({ product }: { product: Product }) {
  useRecentlyViewed(product);
  return null;
}
