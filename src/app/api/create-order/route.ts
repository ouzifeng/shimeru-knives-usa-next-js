import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/woocommerce";

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const order = await createOrder({
      payment_method: "stripe",
      payment_method_title: "Credit Card (Stripe)",
      set_paid: true,
      billing: body.billing,
      shipping: body.shipping,
      line_items: body.line_items,
      shipping_lines: body.shipping_lines,
    });

    return NextResponse.json(order);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Order creation failed" },
      { status: 500 }
    );
  }
}
