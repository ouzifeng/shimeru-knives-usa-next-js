"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FilterOptions {
  categories: { slug: string; name: string; count: number }[];
  attributes: Record<string, { value: string; count: number }[]>;
  tags: Record<string, { slug: string; name: string; count: number }[]>;
  priceRange: { min: number; max: number };
}

function FilterContent({ options, onNavigate }: { options: FilterOptions; onNavigate?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/product?${params.toString()}`);
    onNavigate?.();
  };

  const currentCategory = searchParams.get("category");
  const currentStock = searchParams.get("stock_status");
  const currentSearch = searchParams.get("search");
  const currentOnSale = searchParams.get("on_sale") === "true";

  const hasFilters = currentCategory || currentStock || currentSearch || currentOnSale ||
    Array.from(searchParams.keys()).some((k) => k.startsWith("attr_") || k.startsWith("tag_")) ||
    (searchParams.get("sort") && searchParams.get("sort") !== "newest");

  return (
    <div className="space-y-8">
      {/* Search */}
      <div>
        <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">Search</h3>
        <Input
          placeholder="Search knives..."
          defaultValue={currentSearch || ""}
          className="text-sm h-11"
          onChange={(e) => {
            if (e.target.value.length > 2 || e.target.value.length === 0) {
              updateFilter("search", e.target.value || null);
            }
          }}
        />
      </div>

      {/* Categories */}
      <div>
        <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">Category</h3>
        <div className="space-y-0.5">
          <button
            className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${!currentCategory ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => updateFilter("category", null)}
          >
            All
          </button>
          {options.categories.map((cat) => (
            <button
              key={cat.slug}
              className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${currentCategory === cat.slug ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => updateFilter("category", cat.slug)}
            >
              {cat.name} <span className="text-xs text-muted-foreground ml-1">({cat.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stock status */}
      <div>
        <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">Availability</h3>
        <div className="space-y-0.5">
          <button
            className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${!currentStock ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => updateFilter("stock_status", null)}
          >
            All
          </button>
          <button
            className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${currentStock === "instock" ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => updateFilter("stock_status", "instock")}
          >
            In Stock
          </button>
        </div>
      </div>

      {/* On Sale toggle */}
      <div>
        <button
          className={`text-sm w-full text-left px-3 py-2.5 min-h-[44px] flex items-center gap-2 transition-colors ${currentOnSale ? "text-red-600 font-medium" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => updateFilter("on_sale", currentOnSale ? null : "true")}
        >
          <span className={`h-4 w-4 border rounded flex items-center justify-center shrink-0 ${currentOnSale ? "bg-red-600 border-red-600 text-white" : "border-border"}`}>
            {currentOnSale && <span className="text-xs leading-none">✓</span>}
          </span>
          On Sale
        </button>
      </div>

      {/* Dynamic attributes (skip irrelevant ones) */}
      {Object.entries(options.attributes).filter(([attrName]) => {
        const hidden = ["option", "size", "options", "default title", "ships from", "colour", "color", "grit", "kitchen knife size"];
        return !hidden.includes(attrName.toLowerCase());
      }).map(([attrName, values]) => (
        <div key={attrName}>
          <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">{attrName}</h3>
          <div className="space-y-0.5">
            {values.map((v) => (
              <button
                key={v.value}
                className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${searchParams.get(`attr_${attrName}`) === v.value ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => updateFilter(`attr_${attrName}`, searchParams.get(`attr_${attrName}`) === v.value ? null : v.value)}
              >
                {v.value} <span className="text-xs text-muted-foreground ml-1">({v.count})</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Tag-based filters (Steel Type — Blade Length hidden) */}
      {Object.entries(options.tags || {}).filter(([groupName]) => groupName !== "Blade Length").map(([groupName, values]) => (
        <div key={groupName}>
          <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">{groupName}</h3>
          <div className="space-y-0.5">
            {values.map((v) => {
              const paramKey = `tag_${groupName.toLowerCase().replace(/\s+/g, "_")}`;
              return (
                <button
                  key={v.slug}
                  className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${searchParams.get(paramKey) === v.slug ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => updateFilter(paramKey, searchParams.get(paramKey) === v.slug ? null : v.slug)}
                >
                  {v.name} <span className="text-xs text-muted-foreground ml-1">({v.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Sort */}
      <div>
        <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">Sort By</h3>
        <div className="space-y-0.5">
          {[
            { value: "newest", label: "Newest" },
            { value: "price_asc", label: "Price: Low to High" },
            { value: "price_desc", label: "Price: High to Low" },
            { value: "name", label: "Name" },
          ].map((option) => (
            <button
              key={option.value}
              className={`text-sm block w-full text-left px-3 py-2.5 min-h-[44px] flex items-center transition-colors ${(searchParams.get("sort") || "newest") === option.value ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => updateFilter("sort", option.value === "newest" ? null : option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear */}
      {hasFilters && (
        <button
          className="text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 min-h-[44px] flex items-center"
          onClick={() => {
            router.push("/product");
            onNavigate?.();
          }}
        >
          Clear All Filters
        </button>
      )}
    </div>
  );
}

export function ProductFilters({ options }: { options: FilterOptions }) {
  return (
    <FilterContent options={options} />
  );
}

export function MobileFilters({ options }: { options: FilterOptions }) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  const activeCount = [
    searchParams.get("category"),
    searchParams.get("stock_status"),
    searchParams.get("search"),
    ...Array.from(searchParams.keys()).filter((k) => k.startsWith("attr_") || k.startsWith("tag_")).map((k) => searchParams.get(k)),
    searchParams.get("sort") && searchParams.get("sort") !== "newest" ? searchParams.get("sort") : null,
  ].filter(Boolean).length;

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden flex items-center gap-2 text-sm tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 border border-border"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filter
        {activeCount > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-medium">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-[320px] max-w-[85vw] bg-background z-50 lg:hidden overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
              <span className="text-xs tracking-[0.2em] uppercase font-medium">Filters</span>
              <button
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 pb-8">
              <FilterContent options={options} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
