import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getShippingOptions } from "@/lib/shipping";
import { wcFetch } from "@/lib/woocommerce";
import { getSupabaseAdmin } from "@/lib/supabase";
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
}

export async function POST(req: NextRequest) {
  try {
    const { items, couponCode, attribution, funnelSessionId } = (await req.json()) as {
      items: CartItem[];
      couponCode?: string;
      attribution?: Record<string, string>;
      funnelSessionId?: string;
    };

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
      .select("id, price, sale_price, on_sale, stock_status, name")
      .in("id", productIds);

    if (!dbProducts?.length) {
      return NextResponse.json({ error: "Products not found" }, { status: 400 });
    }

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));

    for (const item of items) {
      const dbProduct = productMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { error: `Product "${item.name}" is no longer available` },
          { status: 400 }
        );
      }
      if (dbProduct.stock_status === "outofstock") {
        return NextResponse.json(
          { error: `"${dbProduct.name}" is out of stock` },
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
      payment_method_types: ["card", "klarna", "afterpay_clearpay", "paypal", "link"],
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
