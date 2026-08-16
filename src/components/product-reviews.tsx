"use client";

import { useState } from "react";
import { StarRating } from "./star-rating";
import type { ProductReview } from "@/lib/types";

export function ProductReviews({
  productId,
  averageRating,
  ratingCount,
  initialReviews,
  totalPages,
}: {
  productId: number;
  averageRating: number;
  ratingCount: number;
  initialReviews: ProductReview[];
  totalPages: number;
}) {
  const [reviews, setReviews] = useState<ProductReview[]>(initialReviews);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  if (!ratingCount && !initialReviews.length) return null;

  async function goToPage(p: number) {
    if (p === page || p < 1 || p > totalPages || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews?page=${p}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-border">
      <details className="group" open>
        <summary className="flex items-center justify-between py-4 cursor-pointer list-none gap-4 min-h-[44px] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3 flex-wrap">
            <span className="text-sm tracking-[0.15em] uppercase font-medium">Customer Reviews</span>
            {ratingCount > 0 && (
              <span className="flex items-center gap-2">
                <StarRating rating={averageRating} />
                <span className="text-sm text-muted-foreground">
                  {averageRating.toFixed(1)} ({ratingCount} {ratingCount === 1 ? "review" : "reviews"})
                </span>
              </span>
            )}
          </span>
          <span className="text-muted-foreground shrink-0 text-lg leading-none transition-transform group-open:rotate-45">
            +
          </span>
        </summary>

        <div className="pb-4">
          {reviews.length > 0 ? (
            <>
              <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
                {reviews.map((review) => (
                  <div key={review.id} className="py-5 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground uppercase shrink-0">
                        {review.reviewer.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium">{review.reviewer}</span>
                          {review.verified && (
                            <span className="text-xs tracking-wider uppercase text-green-700 font-medium">
                              Verified
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <StarRating rating={review.rating} />
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.date_created).toLocaleDateString("en-US", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="text-base text-foreground/85 leading-relaxed pl-11 [&_p]:mb-1 last:[&_p]:mb-0"
                      dangerouslySetInnerHTML={{ __html: review.review }}
                    />
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 pt-5">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1 || loading}
                    className="text-xs tracking-[0.15em] uppercase px-4 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="text-xs tracking-[0.15em] uppercase px-4 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">No reviews to show yet.</p>
          )}
        </div>
      </details>
    </div>
  );
}
