"use client";

import { useEffect, useState } from "react";
import type { ProductVariation, WCAttribute } from "@/lib/types";

interface Props {
  productId: number;
  attributes: WCAttribute[];
  onVariationChange: (variation: ProductVariation | null) => void;
}

export function VariationPicker({ productId, attributes, onVariationChange }: Props) {
  const [variations, setVariations] = useState<ProductVariation[] | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/products/${productId}/variations`)
      .then((res) => res.json())
      .then((data) => setVariations(data));
  }, [productId]);

  useEffect(() => {
    if (!variations) return;

    const attrCount = attributes.length;
    const selectedCount = Object.keys(selected).length;

    if (selectedCount < attrCount) {
      onVariationChange(null);
      return;
    }

    const match = variations.find((v) =>
      v.attributes.every((attr) => selected[attr.name] === attr.option)
    );

    onVariationChange(match || null);
  }, [selected, variations, attributes, onVariationChange]);

  const isOptionAvailable = (attrName: string, optionValue: string): boolean => {
    if (!variations) return true;
    return variations.some(
      (v) =>
        v.attributes.some((a) => a.name === attrName && a.option === optionValue) &&
        v.stock_status === "instock"
    );
  };

  if (!variations) {
    return (
      <div className="space-y-5">
        {attributes.map((attr) => (
          <div key={attr.name}>
            <div className="h-3 w-16 bg-muted animate-pulse mb-3" />
            <div className="flex gap-2">
              {attr.options.map((opt) => (
                <div key={opt} className="h-11 w-16 bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {attributes.map((attr) => (
        <div key={attr.name}>
          <label className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3 block">
            {attr.name}
            {selected[attr.name] && (
              <span className="text-foreground ml-2 normal-case tracking-normal">
                — {selected[attr.name]}
              </span>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            {attr.options.map((option) => {
              const available = isOptionAvailable(attr.name, option);
              const isSelected = selected[attr.name] === option;

              return (
                <button
                  key={option}
                  type="button"
                  disabled={!available}
                  className={`px-4 py-2.5 min-h-[44px] min-w-[44px] border text-sm transition-all ${
                    isSelected
                      ? "border-foreground bg-foreground text-background"
                      : available
                        ? "border-border hover:border-foreground"
                        : "border-border/50 text-muted-foreground/40 line-through cursor-not-allowed"
                  }`}
                  onClick={() =>
                    setSelected((prev) => ({
                      ...prev,
                      [attr.name]: isSelected ? "" : option,
                    }))
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
