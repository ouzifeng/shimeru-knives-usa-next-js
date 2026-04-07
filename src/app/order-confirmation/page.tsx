import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { Check } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { ClearCart } from "@/components/clear-cart";
import { PurchaseTracker } from "@/components/purchase-tracker";
import Link from "next/link";
import { storeConfig } from "../../../store.config";

export default async function OrderConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/");

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });
  } catch {
    redirect("/");
  }

  if (session.payment_status !== "paid") {
    redirect("/checkout");
  }

  const customer = session.customer_details;
  const amountTotal = (session.amount_total || 0) / 100;

  // Build items array for purchase tracking
  const trackingItems = (session.line_items?.data || []).map((item) => ({
    item_id: item.price?.product ? String(item.price.product) : item.id,
    item_name: item.description || "Product",
    quantity: item.quantity || 1,
    price: (item.amount_total || 0) / 100 / (item.quantity || 1),
  }));

  return (
    <div className="container mx-auto px-4 lg:px-8">
      <div className="mx-auto max-w-lg py-16 lg:py-24">
        <ClearCart />
        <PurchaseTracker
          transactionId={session_id}
          value={amountTotal}
          currency={(session.currency || storeConfig.currency).toUpperCase()}
          items={trackingItems}
        />

        <div className="text-center mb-10">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center bg-secondary text-secondary-foreground">
            <Check className="size-7" />
          </div>
          <h1 className="font-serif text-3xl font-light">Order Confirmed</h1>
          <p className="mt-3 text-muted-foreground">
            Thanks{customer?.name ? `, ${customer.name.split(" ")[0]}` : ""}! Your payment was successful.
          </p>
        </div>

        {/* Order Details */}
        <div className="border-y border-border divide-y divide-border">
          {session.line_items?.data.map((item) => (
            <div key={item.id} className="flex justify-between py-4 text-sm">
              <span>
                {item.description}{" "}
                <span className="text-muted-foreground">&times; {item.quantity}</span>
              </span>
              <span className="font-medium">
                {formatPrice((item.amount_total || 0) / 100)}
              </span>
            </div>
          ))}

          {session.total_details?.amount_shipping ? (
            <div className="flex justify-between py-4 text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span className="font-medium">
                {formatPrice(session.total_details.amount_shipping / 100)}
              </span>
            </div>
          ) : null}

          {session.total_details?.amount_discount ? (
            <div className="flex justify-between py-4 text-sm text-secondary">
              <span>Discount</span>
              <span>-{formatPrice(session.total_details.amount_discount / 100)}</span>
            </div>
          ) : null}

          <div className="flex justify-between py-4 font-semibold">
            <span>Total</span>
            <span>{formatPrice(amountTotal)}</span>
          </div>
        </div>

        {customer?.email && (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            A confirmation email will be sent to {customer.email}
          </p>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/product"
            className="inline-block bg-foreground text-background px-8 py-3.5 text-sm tracking-widest uppercase font-medium hover:opacity-90 transition-opacity"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
