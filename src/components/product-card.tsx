import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { StarRating } from "./star-rating";
import { storeConfig } from "../../store.config";

const BLUR_PLACEHOLDER =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJVAH/9k=";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  return (
    <Link href={`/product/${product.slug}`} className="group block">
      {product.images[0] && (
        <div className="aspect-square relative overflow-hidden bg-muted mb-3">
          <Image
            src={product.images[0].src}
            alt={product.images[0].alt || product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            {...(priority ? { priority: true } : { loading: "lazy" })}
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            className="object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
          />
          {product.stock_status === "outofstock" && (
            <span className="absolute top-3 left-3 bg-foreground/80 text-background text-[10px] tracking-widest uppercase px-2.5 py-1 font-medium">
              Sold Out
            </span>
          )}
          {product.on_sale && product.stock_status !== "outofstock" && (
            <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] tracking-widest uppercase px-2.5 py-1 font-medium">
              Sale
            </span>
          )}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-serif text-base sm:text-lg font-medium group-hover:text-primary transition-colors leading-snug">
          {product.name}
        </h3>
        {storeConfig.showReviews && product.rating_count > 0 && product.average_rating && (
          <div className="flex items-center gap-1.5">
            <StarRating rating={product.average_rating} />
            <span className="text-xs text-muted-foreground">({product.rating_count} {product.rating_count === 1 ? "review" : "reviews"})</span>
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
  );
}
