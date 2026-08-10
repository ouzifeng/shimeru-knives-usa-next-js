import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getShippingOptions } from "@/lib/shipping";
import { wcFetch } from "@/lib/woocommerce";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isRestrictedCoupon, computeCouponDiscount, type CouponCartItem } from "@/lib/coupon";
import { storeConfig } from "../../../../store.config";

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variationId?: number;
}

interface WCCoupon {
  id: number;
  code: string;
  discount_type: "percent" | "fixed_cart" | "fixed_product";
  amount: string;
  minimum_amount: string;
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
  try {
    const { items, couponCode, attribution, funnelSessionId, affiliateCode } = (await req.json()) as {
      items: CartItem[];
      couponCode?: string;
      attribution?: Record<string, string>;
      funnelSessionId?: string;
      affiliateCode?: string;
    };
    const affiliateRef = (affiliateCode ?? "").trim().toUpperCase().slice(0, 32);
    const validAffiliateRef = /^[A-Z0-9]+$/.test(affiliateRef) ? affiliateRef : "";

    if (!items?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // Capture customer IP for abandoned cart analysis
    const customerIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    // ── Server-side price & stock validation ───────────────────────
    const supabase = getSupabaseAdmin();
    const productIds = [...new Set(items.map((i) => i.productId))];
    const { data: dbProducts } = await supabase
      .from("products")
      .select("id, price, sale_price, on_sale, stock_status, stock_quantity, name, categories")
      .in("id", productIds);

    if (!dbProducts?.length) {
      return NextResponse.json({ error: "Products not found" }, { status: 400 });
    }

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));

    // Variable products hold their real stock on the variation rows, not the
    // parent — the parent stock_status only flips once EVERY variation sells
    // out. So for any variation line we must gate on the child row, else a
    // sold-out size/handle sails through. Fetch those variations up front.
    const variationIds = [
      ...new Set(items.map((i) => i.variationId).filter((v): v is number => !!v)),
    ];
    const { data: dbVariations } = variationIds.length
      ? await supabase
          .from("product_variations")
          .select("id, stock_status, stock_quantity")
          .in("id", variationIds)
      : { data: [] as { id: number; stock_status: string; stock_quantity: number | null }[] };
    const variationMap = new Map((dbVariations ?? []).map((v) => [v.id, v]));

    for (const item of items) {
      const dbProduct = productMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { error: `Product "${item.name}" is no longer available` },
          { status: 400 }
        );
      }
      // Gate on the row that actually owns the stock: the variation for a
      // variation line, otherwise the simple product itself.
      const stockRow = item.variationId
        ? variationMap.get(item.variationId)
        : dbProduct;
      if (item.variationId && !stockRow) {
        return NextResponse.json(
          { error: `The selected option for "${dbProduct.name}" is no longer available` },
          { status: 400 }
        );
      }
      if (stockRow?.stock_status === "outofstock") {
        return NextResponse.json(
          { error: `"${dbProduct.name}" is out of stock` },
          { status: 400 }
        );
      }
      // Quantity gate: block when the cart wants more than the tracked count.
      // Only applies to in-stock, count-managed items — onbackorder is allowed
      // and a null stock_quantity means WooCommerce isn't tracking a number.
      if (
        stockRow?.stock_status === "instock" &&
        stockRow.stock_quantity != null &&
        stockRow.stock_quantity < item.quantity
      ) {
        return NextResponse.json(
          {
            error:
              stockRow.stock_quantity > 0
                ? `Only ${stockRow.stock_quantity} of "${dbProduct.name}" left in stock`
                : `"${dbProduct.name}" is out of stock`,
          },
          { status: 400 }
        );
      }
      // Use the DB price, not the client-submitted price
      const correctPrice = dbProduct.on_sale && dbProduct.sale_price
        ? parseFloat(dbProduct.sale_price)
        : parseFloat(dbProduct.price);
      // Overwrite client price with server truth
      item.price = correctPrice;
      item.name = dbProduct.name;
    }

    const stripe = getStripe();
    const currency = storeConfig.currency.toLowerCase();
    const origin = req.headers.get("origin") || "";

    // Build line items using validated server prices
    const line_items = items.map((item) => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
          ...(item.image && { images: [item.image] }),
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    // Fetch and format shipping options
    const wcShipping = await getShippingOptions();
    wcShipping.sort((a, b) => a.cost - b.cost);
    const shipping_options = wcShipping.map((opt) => ({
      shipping_rate_data: {
        display_name: opt.title,
        type: "fixed_amount" as const,
        fixed_amount: {
          amount: Math.round(opt.cost * 100),
          currency,
        },
        metadata: { wc_method_id: opt.id, wc_method_title: opt.title },
      },
    }));

    // ── Coupon handling with minimum amount check ──────────────────
    let discounts: { coupon: string }[] | undefined;
    let wcCouponCode: string | undefined;

    if (couponCode) {
      try {
        const coupons = await wcFetch<WCCoupon[]>(
          `/coupons?code=${encodeURIComponent(couponCode)}`
        );
        if (coupons.length) {
          const wc = coupons[0];
          if (wc.usage_limit && wc.usage_count >= wc.usage_limit) {
            return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 400 });
          }
          // Enforce minimum amount
          const cartSubtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
          const minimumAmount = parseFloat(wc.minimum_amount) || 0;
          if (minimumAmount > 0 && cartSubtotal < minimumAmount) {
            return NextResponse.json(
              { error: `Minimum spend of $${minimumAmount.toFixed(2)} required for this coupon` },
              { status: 400 }
            );
          }

          const rules = {
            discount_type: wc.discount_type,
            amount: parseFloat(wc.amount) || 0,
            product_ids: wc.product_ids ?? [],
            excluded_product_ids: wc.excluded_product_ids ?? [],
            product_categories: wc.product_categories ?? [],
            excluded_product_categories: wc.excluded_product_categories ?? [],
            exclude_sale_items: !!wc.exclude_sale_items,
            limit_usage_to_x_items: wc.limit_usage_to_x_items ?? null,
          };

          if (isRestrictedCoupon(rules)) {
            // Product/category/sale-restricted coupon: discount ONLY the eligible
            // lines and charge exactly that, so WooCommerce (which scopes the same
            // coupon the same way via coupon_lines) agrees and the order doesn't
            // get rejected. Reject outright when nothing in the basket qualifies.
            const couponItems: CouponCartItem[] = items.map((i) => {
              const p = productMap.get(i.productId);
              return {
                productId: i.productId,
                price: i.price,
                quantity: i.quantity,
                categoryIds: Array.isArray(p?.categories)
                  ? p!.categories.map((c: { id: number }) => c.id)
                  : [],
                onSale: !!p?.on_sale,
              };
            });
            const { discount } = computeCouponDiscount(couponItems, rules);
            if (discount <= 0) {
              return NextResponse.json(
                { error: `The code "${wc.code}" doesn't apply to any items in your basket` },
                { status: 400 }
              );
            }
            const stripeCoupon = await stripe.coupons.create(
              {
                amount_off: Math.round(discount * 100),
                currency,
                duration: "once",
                name: `WC: ${wc.code}`,
                max_redemptions: 1,
              },
              { idempotencyKey: `coupon_${wc.id}_${Date.now()}` }
            );
            discounts = [{ coupon: stripeCoupon.id }];
            wcCouponCode = wc.code;
          } else {
            const stripeCoupon = await stripe.coupons.create(
              {
                ...(wc.discount_type === "percent"
                  ? { percent_off: parseFloat(wc.amount) }
                  : {
                      amount_off: Math.round(parseFloat(wc.amount) * 100),
                      currency,
                    }),
                duration: "once",
                name: `WC: ${wc.code}`,
                max_redemptions: 1,
              },
              { idempotencyKey: `coupon_${wc.id}_${Date.now()}` }
            );
            discounts = [{ coupon: stripeCoupon.id }];
            wcCouponCode = wc.code;
          }
        }
      } catch (err) {
        // If it's our own validation error, re-throw
        if (err instanceof Response) throw err;
        // Otherwise coupon failed — proceed without discount
      }
    }

    // Store cart data in metadata for the webhook (include prices for GA4)
    const cartMeta = JSON.stringify(
      items.map((i) => ({
        pid: i.productId,
        qty: i.quantity,
        price: i.price,
        ...(i.variationId && { vid: i.variationId }),
      }))
    );

    const sessionParams: Record<string, unknown> = {
      mode: "payment",
      payment_method_types: ["card", "paypal", "link"],
      line_items,
      success_url: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      shipping_address_collection: {
        // US first so the country dropdown defaults to United States on the
        // Stripe-hosted page. GB intentionally omitted — UK customers should
        // use shimeruknives.co.uk instead of buying USD-priced goods here.
        allowed_countries: ["US", "CA", "AU", "NZ", "IE", "DE", "FR", "ES", "IT", "NL", "BE", "AT", "CH", "SE", "DK", "NO", "FI", "PT", "PL"],
      },
      billing_address_collection: "required",
      metadata: {
        cart_items: cartMeta,
        customer_ip: customerIp,
        ...(wcCouponCode && { wc_coupon_code: wcCouponCode }),
        ...(attribution && { attribution: JSON.stringify(attribution) }),
        ...(funnelSessionId && { funnel_session_id: funnelSessionId }),
        ...(validAffiliateRef && { affiliate_code: validAffiliateRef }),
      },
    };

    if (shipping_options.length) {
      sessionParams.shipping_options = shipping_options;
    }
    if (discounts?.length) {
      sessionParams.discounts = discounts;
    }

    const session = await stripe.checkout.sessions.create(sessionParams as any);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
