"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popularity", label: "Best Selling" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name: A to Z" },
];

export function SortDropdown() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") || "newest";

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", value);
    }
    params.delete("page");
    router.push(`/product?${params.toString()}`);
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground hidden sm:inline">
        Sort
      </span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-transparent border border-border px-3 py-2 min-h-[44px] focus:outline-none focus:border-foreground transition-colors cursor-pointer"
        aria-label="Sort products"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
