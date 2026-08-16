import { getProductReviewsPage } from "@/lib/woocommerce";
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
  const { reviews, totalPages } =
    ratingCount > 0
      ? await getProductReviewsPage(productId, 1, 10).catch(() => ({
          reviews: [],
          totalPages: 1,
        }))
      : { reviews: [], totalPages: 1 };

  return (
    <ProductReviews
      productId={productId}
      averageRating={averageRating}
      ratingCount={ratingCount}
      initialReviews={reviews}
      totalPages={totalPages}
    />
  );
}
