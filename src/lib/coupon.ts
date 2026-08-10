// Server-side WooCommerce-coupon eligibility + discount scoping.
//
// A WooCommerce coupon can be restricted to specific products or categories,
// exclude sale items, or cap how many items it applies to. We were ignoring all
// of that: any valid code was translated into a whole-basket Stripe discount, so
// a "75% off product X" code discounted an entire unrelated basket and then
// WooCommerce refused the order (the coupon wasn't valid for those items),
// leaving the customer charged with no order created.
//
// This computes the discount the SAME way WooCommerce will, scoped to the
// eligible lines only, so the amount we charge in Stripe matches the amount WC
// works out from `coupon_lines` and the two stay in step.

export interface WCCouponRules {
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  amount: number; // percent (e.g. 75) or a currency amount
  product_ids: number[];
  excluded_product_ids: number[];
  product_categories: number[];
  excluded_product_categories: number[];
  exclude_sale_items: boolean;
  limit_usage_to_x_items: number | null;
}

export interface CouponCartItem {
  productId: number;
  price: number; // unit price actually being charged
  quantity: number;
  categoryIds: number[];
  onSale: boolean;
}

export interface CouponResult {
  eligibleProductIds: number[];
  discount: number; // total discount in currency, rounded to 2dp
}

/** True when the coupon does not simply apply to the whole basket. */
export function isRestrictedCoupon(r: WCCouponRules): boolean {
  return (
    r.product_ids.length > 0 ||
    r.excluded_product_ids.length > 0 ||
    r.product_categories.length > 0 ||
    r.excluded_product_categories.length > 0 ||
    r.exclude_sale_items ||
    (r.limit_usage_to_x_items ?? 0) > 0
  );
}

/** Is a single cart line eligible for this coupon's discount? */
export function isItemEligible(item: CouponCartItem, r: WCCouponRules): boolean {
  if (r.product_ids.length && !r.product_ids.includes(item.productId)) return false;
  if (r.excluded_product_ids.includes(item.productId)) return false;
  if (
    r.product_categories.length &&
    !item.categoryIds.some((c) => r.product_categories.includes(c))
  )
    return false;
  if (item.categoryIds.some((c) => r.excluded_product_categories.includes(c))) return false;
  if (r.exclude_sale_items && item.onSale) return false;
  return true;
}

/**
 * Compute the discount for a cart under a coupon. percent/fixed_product coupons
 * are scoped to eligible lines only; fixed_cart stays whole-cart (its nature)
 * but still requires at least one eligible line to be present. Returns a zero
 * discount and no eligible ids when nothing in the basket qualifies — callers
 * should reject the coupon in that case.
 */
export function computeCouponDiscount(
  items: CouponCartItem[],
  r: WCCouponRules
): CouponResult {
  const eligible = items.filter((i) => isItemEligible(i, r));
  const eligibleProductIds = [...new Set(eligible.map((i) => i.productId))];
  if (!eligible.length) return { eligibleProductIds: [], discount: 0 };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (r.discount_type === "fixed_cart") {
    const cartSubtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    return { eligibleProductIds, discount: round2(Math.min(r.amount, cartSubtotal)) };
  }

  // percent / fixed_product apply per eligible unit. Expand eligible lines into
  // individual units so the item cap (limit_usage_to_x_items) and the per-unit
  // maths are exact. Highest-priced units first, matching WooCommerce.
  const cap = r.limit_usage_to_x_items ?? Infinity;
  const unitPrices: number[] = [];
  for (const i of eligible) for (let q = 0; q < i.quantity; q++) unitPrices.push(i.price);
  unitPrices.sort((a, b) => b - a);
  const applied = cap === Infinity ? unitPrices : unitPrices.slice(0, cap);

  let discount = 0;
  if (r.discount_type === "percent") {
    for (const p of applied) discount += p * (r.amount / 100);
  } else {
    // fixed_product: amount off each eligible unit, never below the unit price.
    for (const p of applied) discount += Math.min(r.amount, p);
  }
  return { eligibleProductIds, discount: round2(discount) };
}
