"use client";

import Image from "next/image";
import { useState } from "react";
import type { WCImage } from "@/lib/types";

export function ImageGallery({ images, onSale, outOfStock }: { images: WCImage[]; onSale?: boolean; outOfStock?: boolean }) {
  const [selected, setSelected] = useState(0);

  if (!images.length) return null;

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="aspect-square relative overflow-hidden bg-muted w-full">
        <Image
          src={images[selected].src}
          alt={images[selected].alt || "Product image"}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
          className="object-cover"
        />
        {outOfStock && (
          <span className="absolute top-3 left-3 bg-foreground/80 text-background text-[10px] tracking-widest uppercase px-2.5 py-1 font-medium">
            Sold Out
          </span>
        )}
        {onSale && !outOfStock && (
          <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-[10px] tracking-widest uppercase px-2.5 py-1 font-medium">
            Sale
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setSelected(i)}
              className={`relative w-14 h-14 sm:w-18 sm:h-18 overflow-hidden shrink-0 transition-all ${
                i === selected
                  ? "ring-2 ring-primary ring-offset-1 sm:ring-offset-2 ring-offset-background"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <Image src={img.src} alt={img.alt || "Product thumbnail"} fill sizes="72px" loading="lazy" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
