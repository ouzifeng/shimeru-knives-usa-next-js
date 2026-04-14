import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createOrder, wcFetch } from "@/lib/woocommerce";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fireServerPurchaseEvent } from "@/lib/tracking-server";
import { sendTelegramMessage } from "@/lib/telegram";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // The UK and US stores share one Stripe account, so every event is delivered
  // to both webhook endpoints. Only handle events whose checkout was created
  // from this store's domain.
  const obj = event.data.object as { success_url?: string; cancel_url?: string };
  const routingUrl = obj.success_url || obj.cancel_url;
  if (routingUrl) {
    try {
      const host = new URL(routingUrl).hostname;
      if (!host.endsWith("shimeruknives.com") || host.endsWith("shimeruknives.co.uk")) {
        return NextResponse.json({ received: true, ignored: "other-store" });
      }
    } catch {
      // Malformed URL — fall through and let the handler decide
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const admin = getSupabaseAdmin();

    // ── Idempotency check — skip only if WC order was created ──────
    const { data: existing } = await admin
      .from("orders")
      .select("id, wc_created")
      .eq("stripe_session_id", session.id)
      .limit(1);

    const existingOrder = existing?.[0];
    if (existingOrder?.wc_created) {
      console.log("Webhook already processed for session:", session.id);
      return NextResponse.json({ received: true, skipped: true });
    }

    try {
      // Parse cart items from metadata
      const cartItems: { pid: number; qty: number; vid?: number; price?: number }[] = JSON.parse(
        session.metadata?.cart_items || "[]"
      );
      const wcCouponCode = session.metadata?.wc_coupon_code;
      const attribution = session.metadata?.attribution
        ? JSON.parse(session.metadata.attribution)
        : null;

      if (!cartItems.length) {
        console.error("No cart items in session metadata:", session.id);
        return NextResponse.json({ received: true });
      }

      // Retrieve the full session to get shipping details (webhook payload may not include them)
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["shipping_cost.shipping_rate"],
      });

      const customer = fullSession.customer_details;
      const shippingCost = (fullSession as any).shipping_cost;

      // In Stripe SDK v20+ (API 2025), shipping moved to collected_information.shipping_details.
      // Older versions used top-level shipping_details or shipping.
      const shipping = fullSession.collected_information?.shipping_details
        || (fullSession as any).shipping_details
        || (fullSession as any).shipping;

      if (!shipping?.address) {
        // This should never happen since we require shipping_address_collection,
        // but log everything so we can diagnose if it does
        const raw = fullSession as any;
        console.error(
          "[SHIPPING BUG] No shipping address found on session!",
          JSON.stringify({
            sessionId: session.id,
            collected_information: fullSession.collected_information,
            shipping_details: raw.shipping_details,
            shipping: raw.shipping,
          })
        );
      }

      // Parse name into first/last
      const billingName = customer?.name?.split(" ") || [""];
      const shippingName = shipping?.name?.split(" ") || billingName;

      const billingAddress = {
        first_name: billingName[0] || "",
        last_name: billingName.slice(1).join(" ") || "",
        address_1: customer?.address?.line1 || "",
        address_2: customer?.address?.line2 || "",
        city: customer?.address?.city || "",
        state: customer?.address?.state || "",
        postcode: customer?.address?.postal_code || "",
        country: customer?.address?.country || "",
        email: customer?.email || "",
        phone: customer?.phone || "",
      };

      // Use shipping address from Stripe; only fall back to billing if Stripe
      // genuinely didn't collect a separate shipping address.
      const shipAddr = shipping?.address;
      const shippingAddress = {
        first_name: shippingName[0] || "",
        last_name: shippingName.slice(1).join(" ") || "",
        address_1: shipAddr?.line1 || customer?.address?.line1 || "",
        address_2: shipAddr?.line2 || customer?.address?.line2 || "",
        city: shipAddr?.city || customer?.address?.city || "",
        state: shipAddr?.state || customer?.address?.state || "",
        postcode: shipAddr?.postal_code || customer?.address?.postal_code || "",
        country: shipAddr?.country || customer?.address?.country || "",
      };

      // Build shipping lines
      const shipping_lines: { method_id: string; method_title: string; total: string }[] = [];
      if (shippingCost) {
        let methodId = "flat_rate";
        let methodTitle = "Shipping";

        if (shippingCost.shipping_rate) {
          try {
            // shipping_rate may already be expanded from the retrieve call
            const rate = typeof shippingCost.shipping_rate === "string"
              ? await stripe.shippingRates.retrieve(shippingCost.shipping_rate)
              : shippingCost.shipping_rate;
            methodId = rate.metadata?.wc_method_id || (shippingCost.amount_total === 0 ? "free_shipping" : "flat_rate");
            methodTitle = rate.metadata?.wc_method_title || rate.display_name || "Shipping";
          } catch {
            // Use defaults
          }
        }

        shipping_lines.push({
          method_id: methodId,
          method_title: methodTitle,
          total: (shippingCost.amount_total / 100).toFixed(2),
        });
      }

      // ── Create WooCommerce order (with retry) ────────────────────
      let wcOrder: any = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          wcOrder = await createOrder({
            payment_method: "stripe",
            payment_method_title: "Stripe Checkout",
            set_paid: true,
            billing: billingAddress,
            shipping: shippingAddress,
            line_items: cartItems.map((item) => ({
              product_id: item.pid,
              quantity: item.qty,
              ...(item.vid && { variation_id: item.vid }),
            })),
            shipping_lines,
            coupon_lines: wcCouponCode ? [{ code: wcCouponCode }] : [],
            ...(attribution && {
              meta_data: [
                { key: "_wc_order_attribution_source_type", value: attribution.utm_source ? "utm" : "typein" },
                { key: "_wc_order_attribution_utm_source", value: attribution.utm_source || "(direct)" },
                { key: "_wc_order_attribution_utm_medium", value: attribution.utm_medium || "(none)" },
                { key: "_wc_order_attribution_utm_campaign", value: attribution.utm_campaign || "" },
                { key: "_wc_order_attribution_utm_content", value: attribution.utm_content || "" },
                { key: "_wc_order_attribution_utm_term", value: attribution.utm_term || "" },
                { key: "_wc_order_attribution_referrer", value: attribution.referrer || "" },
                { key: "_wc_order_attribution_session_entry", value: attribution.landing_page || "" },
              ].filter((m) => m.value),
            }),
          } as any);
          break; // Success
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            // Wait 1s, then 3s before retrying
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
          }
        }
      }

      // ── Retrieve Stripe fee from balance transaction ────────────
      let stripeFee = 0;
      let stripeNet = 0;
      try {
        if (session.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
            expand: ["latest_charge.balance_transaction"],
          });
          const charge = pi.latest_charge as Stripe.Charge | undefined;
          const bt = charge?.balance_transaction as Stripe.BalanceTransaction | undefined;
          if (bt) {
            stripeFee = bt.fee / 100;
            stripeNet = bt.net / 100;
          }
        }
      } catch (feeErr) {
        console.error("Failed to retrieve Stripe fee:", feeErr);
      }

      // Write Stripe fee meta to WC order
      if (wcOrder && stripeFee > 0) {
        try {
          await wcFetch(`/orders/${wcOrder.id}`, {
            method: "PUT",
            body: JSON.stringify({
              meta_data: [
                { key: "_stripe_fee", value: stripeFee.toFixed(2) },
                { key: "_stripe_net", value: stripeNet.toFixed(2) },
                { key: "_stripe_currency", value: (session.currency || "gbp").toUpperCase() },
              ],
            }),
          });
        } catch (feeUpdateErr) {
          console.error("Failed to update WC order with Stripe fee:", feeUpdateErr);
        }
      }

      // ── Save order to Supabase ───────────────────────────────────
      const amountTotal = (session.amount_total || 0) / 100;
      const currency = (session.currency || "gbp").toUpperCase();
      const wcCreated = !!wcOrder;

      const orderRow = {
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent,
        wc_order_id: wcOrder?.id || null,
        customer_email: customer?.email || null,
        customer_name: customer?.name || null,
        amount_total: amountTotal,
        currency,
        status: wcCreated ? "completed" : "wc_failed",
        line_items: cartItems,
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        coupon_code: wcCouponCode || null,
        wc_created: wcCreated,
        attribution: attribution || null,
        customer_ip: session.metadata?.customer_ip || null,
        stripe_fee: stripeFee,
        created_at: new Date().toISOString(),
      };

      try {
        if (existingOrder) {
          // Update existing failed row on retry
          await admin.from("orders").update(orderRow).eq("id", existingOrder.id);
        } else {
          await admin.from("orders").insert(orderRow);
        }
      } catch (sbErr) {
        console.error("Failed to save order to Supabase:", sbErr);
      }

      if (!wcOrder) {
        console.error("Failed to create WC order after 3 attempts:", lastError);
        try {
          await sendTelegramMessage(
            `⚠️ <b>WC Order Failed!</b>\n\n` +
            `<b>Customer:</b> ${customer?.name || "Unknown"}\n` +
            `<b>Email:</b> ${customer?.email || "—"}\n` +
            `<b>Amount:</b> ${currency} ${amountTotal.toFixed(2)}\n` +
            `<b>Error:</b> ${lastError instanceof Error ? lastError.message : "Unknown"}\n` +
            `\nPayment was taken but WC order creation failed after 3 attempts.`
          );
        } catch { /* non-critical */ }
        // Return 500 so Stripe retries the webhook
        return NextResponse.json({ error: "WC order creation failed" }, { status: 500 });
      }

      // ── GA4 tracking (with per-item prices) ──────────────────────
      try {
        const { data: trackingRows } = await admin
          .from("settings")
          .select("key, value")
          .in("key", ["ga4_measurement_id", "ga4_api_secret"]);

        const trackingSettings: Record<string, string> = {};
        trackingRows?.forEach((row) => {
          trackingSettings[row.key] = row.value;
        });

        if (trackingSettings.ga4_measurement_id && trackingSettings.ga4_api_secret) {
          // Use the real GA4 client ID from the browser if available — this lets Google
          // match the server-side purchase event back to the original ad click / session.
          // Falls back to a synthetic ID for users where the cookie wasn't captured.
          const clientId = attribution?.ga_client_id || `stripe_${session.id}`;

          await fireServerPurchaseEvent({
            measurement_id: trackingSettings.ga4_measurement_id,
            api_secret: trackingSettings.ga4_api_secret,
            client_id: clientId,
            transaction_id: session.id,
            value: amountTotal,
            currency,
            items: cartItems.map((item) => ({
              item_id: String(item.pid),
              item_name: `Product ${item.pid}`,
              quantity: item.qty,
              price: item.price || 0,
            })),
            gclid: attribution?.gclid,
          });
        }
      } catch (trackingErr) {
        console.error("Server-side GA4 tracking failed:", trackingErr);
      }

      // ── Telegram notification ────────────────────────────────────
      try {
        // Look up product names and current stock
        const productIds = [...new Set(cartItems.map((i) => i.pid))];
        const variationIds = cartItems.filter((i) => i.vid).map((i) => i.vid!);

        const [{ data: products }, { data: variations }] = await Promise.all([
          admin.from("products").select("id, name, stock_quantity").in("id", productIds),
          variationIds.length
            ? admin.from("product_variations").select("id, product_id, stock_quantity, attributes").in("id", variationIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const productMap = new Map(products?.map((p: any) => [p.id, p]) || []);
        const variationMap = new Map(variations?.map((v: any) => [v.id, v]) || []);

        const itemLines = cartItems.map((item) => {
          const product = productMap.get(item.pid);
          let name = product?.name || `Product ${item.pid}`;

          if (item.vid) {
            const variation = variationMap.get(item.vid);
            if (variation?.attributes?.length) {
              const attrs = variation.attributes.map((a: any) => a.option).join(", ");
              name += ` (${attrs})`;
            }
          }

          const stock = item.vid
            ? variationMap.get(item.vid)?.stock_quantity
            : product?.stock_quantity;
          const stockText = stock != null ? `${stock} left` : "—";

          return `  • ${name} x${item.qty}  [${stockText}]`;
        });

        await sendTelegramMessage(
          `🔔 <b>New Order!</b>\n\n` +
          `<b>Customer:</b> ${customer?.name || "Unknown"}\n` +
          `<b>Email:</b> ${customer?.email || "—"}\n` +
          `<b>Amount:</b> ${currency} ${amountTotal.toFixed(2)}\n` +
          (wcCouponCode ? `<b>Coupon:</b> ${wcCouponCode}\n` : "") +
          (wcOrder ? `<b>WC Order:</b> #${wcOrder.id}\n` : "") +
          `\n<b>Items:</b>\n${itemLines.join("\n")}`
        );
      } catch {
        // Non-critical — don't fail the webhook
      }
    } catch (err) {
      console.error("Failed to process webhook:", err);
      // Return 500 so Stripe retries
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  }

  // ── Checkout expired (abandoned) ───────────────────────────────
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const admin = getSupabaseAdmin();

    try {
      const cartItems = JSON.parse(session.metadata?.cart_items || "[]");
      const customer = session.customer_details;
      const attribution = session.metadata?.attribution
        ? JSON.parse(session.metadata.attribution)
        : null;

      // Check for payment failure reason if a payment intent exists
      let abandonReason: string | null = null;
      if (session.payment_intent) {
        try {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
          const lastCharge = pi.latest_charge;
          if (lastCharge && typeof lastCharge === "string") {
            const charge = await stripe.charges.retrieve(lastCharge);
            if (charge.failure_message) {
              abandonReason = charge.failure_message;
            } else if (charge.outcome?.reason) {
              abandonReason = charge.outcome.reason;
            }
          }
          if (!abandonReason && pi.last_payment_error?.message) {
            abandonReason = pi.last_payment_error.message;
          }
        } catch {
          // Couldn't retrieve — leave as null
        }
      }

      await admin.from("orders").insert({
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent || null,
        wc_order_id: null,
        customer_email: customer?.email || null,
        customer_name: customer?.name || null,
        amount_total: (session.amount_total || 0) / 100,
        currency: (session.currency || "gbp").toUpperCase(),
        status: "abandoned",
        line_items: cartItems,
        billing_address: null,
        shipping_address: null,
        coupon_code: session.metadata?.wc_coupon_code || null,
        wc_created: false,
        attribution: attribution || null,
        customer_ip: session.metadata?.customer_ip || null,
        abandon_reason: abandonReason,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to log abandoned checkout:", err);
    }
  }

  // ── Charge refunded ──────────────────────────────────────────
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const admin = getSupabaseAdmin();

    try {
      const paymentIntent = charge.payment_intent as string;
      await admin
        .from("orders")
        .update({ status: "refunded" })
        .eq("stripe_payment_intent", paymentIntent);
    } catch (err) {
      console.error("Failed to update refunded order:", err);
    }
  }

  // ── Charge disputed ──────────────────────────────────────────
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const admin = getSupabaseAdmin();

    try {
      const paymentIntent = dispute.payment_intent as string;
      await admin
        .from("orders")
        .update({ status: "disputed" })
        .eq("stripe_payment_intent", paymentIntent);
    } catch (err) {
      console.error("Failed to update disputed order:", err);
    }
  }

  return NextResponse.json({ received: true });
}
