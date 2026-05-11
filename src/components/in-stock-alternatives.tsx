import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";

export function InStockAlternatives({
  products,
  categorySlug,
  categoryName,
}: {
  products: Product[];
  categorySlug?: string;
  categoryName?: string;
}) {
  if (products.length === 0) {
    if (!categorySlug) return null;
    return (
      <div className="border-t border-border pt-5 sm:pt-6">
        <Link
          href={`/product?category=${categorySlug}&stock_status=instock`}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Browse all in-stock {categoryName ?? "knives"} →
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-5 sm:pt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground">
          In stock alternatives
        </h2>
        {categorySlug && (
          <Link
            href={`/product?category=${categorySlug}&stock_status=instock`}
            className="text-xs font-medium underline-offset-4 hover:underline shrink-0"
          >
            See all →
          </Link>
        )}
      </div>
      <ul className="grid grid-cols-4 gap-2 sm:gap-4">
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/product/${p.slug}`} className="group block">
              {p.images[0] && (
                <div className="aspect-square relative overflow-hidden bg-muted mb-2">
                  <Image
                    src={p.images[0].src}
                    alt={p.images[0].alt || p.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    loading="lazy"
                    className="object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
                  />
                </div>
              )}
              <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                {p.name}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatPrice(
                  p.on_sale && p.sale_price ? p.sale_price : p.price
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
