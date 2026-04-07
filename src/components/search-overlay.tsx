"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/format";

interface SearchResult {
  id: number;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  on_sale: boolean;
  images: { src: string; alt: string }[];
  stock_status: string;
}

interface SearchCategory {
  slug: string;
  name: string;
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [categories, setCategories] = useState<SearchCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const router = useRouter();

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setCategories([]);
    }
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      setCategories([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setCategories(data.categories || []);
    } catch {
      setResults([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/product?search=${encodeURIComponent(query.trim())}`);
      onClose();
    }
  };

  const navigate = (path: string) => {
    router.push(path);
    onClose();
  };

  if (!open) return null;

  const hasResults = results.length > 0 || categories.length > 0;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Search panel */}
      <div className="relative bg-background w-full max-w-2xl mx-auto mt-0 sm:mt-20 shadow-2xl">
        <form onSubmit={handleSubmit} className="flex items-center border-b border-border">
          <Search className="size-5 text-muted-foreground ml-5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Search knives..."
            className="flex-1 bg-transparent px-4 py-5 text-base outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground mr-2" />}
          <button
            type="button"
            onClick={onClose}
            className="p-4 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </form>

        <div className="max-h-[60vh] overflow-y-auto">
          {/* Category matches */}
          {categories.length > 0 && (
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => navigate(`/product?category=${cat.slug}`)}
                    className="text-sm px-3 py-1.5 border border-border hover:bg-muted transition-colors"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product results */}
          {results.length > 0 && (
            <div className="divide-y divide-border">
              {categories.length > 0 && (
                <div className="px-5 pt-3 pb-1">
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Products</p>
                </div>
              )}
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => navigate(`/product/${product.slug}`)}
                  className="flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="w-14 h-14 shrink-0 bg-muted overflow-hidden">
                    {product.images?.[0] && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={product.images[0].src}
                        alt={product.images[0].alt || product.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm">
                        {formatPrice(product.price)}
                      </span>
                      {product.on_sale && product.sale_price && (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatPrice(product.sale_price)}
                        </span>
                      )}
                      {product.stock_status === "outofstock" && (
                        <span className="text-xs text-red-500">Sold out</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* View all results link */}
          {results.length > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/product?search=${encodeURIComponent(query.trim())}`)}
              className="w-full px-5 py-3 text-sm text-center text-primary hover:bg-muted/50 transition-colors border-t border-border"
            >
              View all results for &ldquo;{query}&rdquo;
            </button>
          )}

          {/* No results */}
          {query.length >= 3 && !loading && !hasResults && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Hint */}
          {query.length < 3 && (
            <div className="px-5 py-6 text-center text-xs text-muted-foreground">
              Type at least 3 characters to search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
