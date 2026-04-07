import { getProductReviews } from "@/lib/woocommerce";
import { ProductReviews } from "./product-reviews";

export async function ProductReviewsLoader({
  productId,
  averageRating,
  ratingCount,
}: {
  productId: number;
  averageRating: number;
  ratingCount: number;
}) {
  const reviews = ratingCount > 0
    ? await getProductReviews(productId, { per_page: 25 }).catch(() => [])
    : [];

  return (
    <ProductReviews
      productId={productId}
      averageRating={averageRating}
      ratingCount={ratingCount}
      initialReviews={reviews}
    />
  );
}
