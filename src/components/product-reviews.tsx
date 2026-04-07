import { StarRating } from "./star-rating";
import type { ProductReview } from "@/lib/types";

export function ProductReviews({
  averageRating,
  ratingCount,
  initialReviews,
}: {
  productId: number;
  averageRating: number;
  ratingCount: number;
  initialReviews: ProductReview[];
}) {
  if (!ratingCount && !initialReviews.length) return null;

  return (
    <div>
      <h2 className="text-sm tracking-[0.2em] uppercase text-muted-foreground mb-4">
        Customer Reviews
      </h2>

      {/* Summary */}
      {ratingCount > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <StarRating rating={averageRating} size="lg" />
          <span className="text-base font-medium">{averageRating.toFixed(1)}</span>
          <span className="text-base text-muted-foreground">
            ({ratingCount} {ratingCount === 1 ? "review" : "reviews"})
          </span>
        </div>
      )}

      {/* Review list */}
      {initialReviews.length > 0 && (
        <div>
          {initialReviews.map((review) => (
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
      )}
    </div>
  );
}
