import { NextRequest, NextResponse } from "next/server";
import { wcFetch } from "@/lib/woocommerce";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  isRestrictedCoupon,
  computeCouponDiscount,
  type CouponCartItem,
} from "@/lib/coupon";

interface WCCoupon {
  id: number;
  code: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  amount: string;
  minimum_amount: string;
  maximum_amount: string;
  usage_limit: number | null;
  usage_count: number;
  product_ids: number[];
  excluded_product_ids: number[];
  product_categories: number[];
  excluded_product_categories: number[];
  exclude_sale_items: boolean;
  limit_usage_to_x_items: number | null;
}

export async function POST(req: NextRequest) {
  const { code, items, cartTotal } = (await req.json()) as {
    code: string;
    items?: { productId: number; quantity: number }[];
    cartTotal?: number;
  };

  try {
    const coupons = await wcFetch<WCCoupon[]>(`/coupons?code=${encodeURIComponent(code)}`);
    if (!coupons.length) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 404 });
    }

    const coupon = coupons[0];

    // Check usage limit
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 400 });
    }

    const rules = {
      discount_type: coupon.discount_type,
      amount: parseFloat(coupon.amount) || 0,
      product_ids: coupon.product_ids ?? [],
      excluded_product_ids: coupon.excluded_product_ids ?? [],
      product_categories: coupon.product_categories ?? [],
      excluded_product_categories: coupon.excluded_product_categories ?? [],
      exclude_sale_items: !!coupon.exclude_sale_items,
      limit_usage_to_x_items: coupon.limit_usage_to_x_items ?? null,
    };

    // Resolve the cart against Supabase so we can (a) enforce min-spend on server
    // prices and (b) work out which lines this coupon is actually allowed to
    // discount. Falls back to the client cartTotal if no items were sent.
    let cartSubtotal = cartTotal ?? 0;
    let eligible_product_ids: number[] | null = null;

    if (items?.length) {
      const supabase = getSupabaseAdmin();
      const productIds = [...new Set(items.map((i) => i.productId))];
      const { data: dbProducts } = await supabase
        .from("products")
        .select("id, price, sale_price, on_sale, categories, name")
        .in("id", productIds);
      const productMap = new Map((dbProducts ?? []).map((p) => [p.id, p]));

      const couponItems: CouponCartItem[] = items.map((i) => {
        const p = productMap.get(i.productId);
        const unit = p?.on_sale && p?.sale_price ? parseFloat(p.sale_price) : parseFloat(p?.price ?? "0");
        return {
          productId: i.productId,
          price: unit,
          quantity: i.quantity,
          categoryIds: Array.isArray(p?.categories) ? p!.categories.map((c: { id: number }) => c.id) : [],
          onSale: !!p?.on_sale,
        };
      });
      cartSubtotal = couponItems.reduce((s, i) => s + i.price * i.quantity, 0);

      if (isRestrictedCoupon(rules)) {
        const { eligibleProductIds, discount } = computeCouponDiscount(couponItems, rules);
        if (discount <= 0) {
          return NextResponse.json(
            { error: `This code doesn't apply to any items in your basket` },
            { status: 400 }
          );
        }
        eligible_product_ids = eligibleProductIds;
      }
    }

    // Check minimum amount against the (server-priced) cart subtotal.
    const minimumAmount = parseFloat(coupon.minimum_amount) || 0;
    if (minimumAmount > 0 && cartSubtotal > 0 && cartSubtotal < minimumAmount) {
      return NextResponse.json(
        { error: `Minimum spend of $${minimumAmount.toFixed(2)} required` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      code: coupon.code,
      discount_type: coupon.discount_type,
      amount: parseFloat(coupon.amount),
      minimum_amount: minimumAmount,
      restricted: isRestrictedCoupon(rules),
      eligible_product_ids,
    });
  } catch {
    return NextResponse.json({ error: "Could not validate coupon" }, { status: 500 });
  }
}
