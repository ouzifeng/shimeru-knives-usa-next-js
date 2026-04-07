"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { StarRating } from "./star-rating";

const STORAGE_KEY = "recently-viewed";
const MAX_ITEMS = 8;

interface MinimalProduct {
  id: number;
  name: string;
  slug: string;
  price: number;
  regular_price: number | null;
  on_sale: boolean;
  image: string;
  image_alt: string;
  average_rating: number | null;
  rating_count: number;
}

export function useRecentlyViewed(currentProduct?: Product) {
  useEffect(() => {
    if (!currentProduct) return;

    const stored: MinimalProduct[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    // Remove current product if already in list
    const filtered = stored.filter((p) => p.id !== currentProduct.id);

    // Add current product to front
    filtered.unshift({
      id: currentProduct.id,
      name: currentProduct.name,
      slug: currentProduct.slug,
      price: currentProduct.price,
      regular_price: currentProduct.regular_price,
      on_sale: currentProduct.on_sale,
      image: currentProduct.images[0]?.src || "",
      image_alt: currentProduct.images[0]?.alt || currentProduct.name,
      average_rating: currentProduct.average_rating,
      rating_count: currentProduct.rating_count,
    });

    // Keep only MAX_ITEMS
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
  }, [currentProduct]);
}

export function RecentlyViewed({ currentProductId }: { currentProductId: number }) {
  const [products, setProducts] = useState<MinimalProduct[]>([]);

  useEffect(() => {
    const stored: MinimalProduct[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );
    // Exclude the product currently being viewed
    setProducts(stored.filter((p) => p.id !== currentProductId));
  }, [currentProductId]);

  if (products.length === 0) return null;

  return (
    <div className="mt-12 lg:mt-16">
      <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-6">
        Recently Viewed
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.slice(0, 4).map((product) => (
          <Link key={product.id} href={`/product/${product.slug}`} className="group block">
            {product.image && (
              <div className="aspect-square relative overflow-hidden bg-muted mb-3">
                <Image
                  src={product.image}
                  alt={product.image_alt}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  loading="lazy"
                  className="object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
                />
              </div>
            )}
            <div className="space-y-1">
              <h3 className="font-serif text-base sm:text-lg font-medium group-hover:text-primary transition-colors leading-snug">
                {product.name}
              </h3>
              {product.rating_count > 0 && product.average_rating && (
                <div className="flex items-center gap-1.5">
                  <StarRating rating={product.average_rating} />
                  <span className="text-xs text-muted-foreground">({product.rating_count})</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-base font-medium">{formatPrice(product.price)}</span>
                {product.on_sale && product.regular_price && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(product.regular_price)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
