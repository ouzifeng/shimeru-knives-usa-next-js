"use client";

import { useEffect, useState } from "react";

interface StoreReviewData {
  name: string;
  averageRating: number;
  totalReviews: number;
  logo?: string;
}

const SLUG = "shimeru-knives";
const API_URL = `https://woohub-backend.vercel.app/api/public/stores/${SLUG}?limit=0`;

let cached: StoreReviewData | null = null;

export function EcommanderBadge({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [data, setData] = useState<StoreReviewData | null>(cached);

  useEffect(() => {
    if (cached) return;
    fetch(API_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.store) {
          cached = json.store;
          setData(json.store);
        }
      })
      .catch(() => {});
  }, []);

  if (!data || !data.totalReviews) return null;

  const filled = Math.round(data.averageRating);

  const isDark = variant === "dark";

  return (
    <a
      href={`https://reviews.ecommander.io/${SLUG}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 transition-colors ${
        isDark
          ? "px-4 py-2.5 rounded-sm border border-background/10 hover:border-background/25"
          : ""
      }`}
    >
      {/* Stars */}
      <span className="flex gap-0.5 text-sm" aria-label={`${data.averageRating} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={
              i <= filled
                ? "text-amber-500"
                : isDark
                  ? "text-background/20"
                  : "text-border"
            }
          >
            ★
          </span>
        ))}
      </span>

      {/* Rating + count */}
      <span
        className={`text-sm transition-colors ${
          isDark
            ? "text-background/70 group-hover:text-background/90"
            : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        <span className={`font-semibold ${isDark ? "text-background/90" : "text-foreground"}`}>
          {data.averageRating.toFixed(1)}
        </span>
        {" "}from {data.totalReviews.toLocaleString()} store reviews
      </span>

      {/* Subtle attribution — footer only */}
      {isDark && (
        <span className="text-[10px] tracking-[0.15em] uppercase text-background/25 hidden sm:inline">
          Ecommander
        </span>
      )}
    </a>
  );
}
