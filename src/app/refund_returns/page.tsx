"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Package, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

interface OrderItem {
  pid: number;
  vid?: number;
  name: string;
  qty: number;
  price: number;
}

interface OrderData {
  orderId: number;
  wcOrderId: number;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  items: OrderItem[];
}

type Step = "lookup" | "select" | "policy" | "confirm";

const RETURN_ADDRESS = `Kays Logistics C/O Shimeru Knives
1 Windward Drive
Estuary Commerce Park
Speke
Liverpool
L24 8QR`;

export default function ReturnsPage() {
  const [step, setStep] = useState<Step>("lookup");
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderData | null>(null);
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState("");
  const [policyAgreed, setPolicyAgreed] = useState(false);

  // Step 1: Look up order
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/returns/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), orderNumber: orderNumber.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setOrder(data);
      // Pre-select all items
      const initial = new Map<string, number>();
      for (const item of data.items) {
        const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
        initial.set(key, item.qty);
      }
      setSelectedItems(initial);
      setStep("select");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Toggle item selection
  function toggleItem(item: OrderItem) {
    const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, item.qty);
      }
      return next;
    });
  }

  function updateQty(item: OrderItem, qty: number) {
    const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (qty <= 0) {
        next.delete(key);
      } else {
        next.set(key, Math.min(qty, item.qty));
      }
      return next;
    });
  }

  // Submit return
  async function handleSubmit() {
    if (!order) return;
    setError("");
    setLoading(true);

    const items = Array.from(selectedItems.entries()).map(([key, qty]) => {
      const [pid, vid] = key.split("-").map(Number);
      return { pid, vid: vid || undefined, qty };
    });

    try {
      const res = await fetch("/api/returns/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.orderId,
          email: order.customerEmail,
          items,
          reason: reason || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setStep("confirm");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-10">
        Refund and Returns Policy
      </h1>

      <div className="prose-sm space-y-8 text-sm leading-relaxed text-foreground/80 mb-12">
        <p>
          We are happy to refund your goods on the criteria below. We currently do not offer
          exchanges at this time. If you wish to receive a different item a new order will have to
          be placed online.
        </p>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">Returns</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Once you have received your goods, please request a return within 60 days of
              receiving your order using the form below. Please remember to include your order
              number and email address that the order was attached to.
            </li>
            <li>The goods need to be complete and unused with the original packaging.</li>
            <li>
              The cost of the return delivery shall be paid for by the customer unless otherwise
              agreed by us.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-3">Faulty Items</h2>
          <p>
            If your item is faulty, we will be able to facilitate a free return for you if this is
            needed regardless of your location. So that we are able to assist you in the best way
            possible please{" "}
            <a href="/contact" className="text-primary underline underline-offset-2 hover:text-primary/80">
              contact us first
            </a>{" "}
            regarding any damaged or faulty items.
          </p>
        </section>
      </div>

      {/* Return Request Form */}
      <div className="border-t pt-10">
        <h2 className="font-serif text-2xl font-light tracking-tight mb-2">
          Start a Return
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Use the form below to submit your return request.
        </p>
      </div>

      {/* Step indicators */}
      {step !== "confirm" && (
        <div className="flex items-center gap-2 mb-8 text-xs text-muted-foreground">
          <span className={step === "lookup" ? "text-foreground font-medium" : ""}>
            1. Find Order
          </span>
          <span className="text-border">/</span>
          <span className={step === "select" ? "text-foreground font-medium" : ""}>
            2. Select Items
          </span>
          <span className="text-border">/</span>
          <span className={step === "policy" ? "text-foreground font-medium" : ""}>
            3. Confirm
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600 mb-6">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Step 1: Lookup */}
      {step === "lookup" && (
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="The email used for your order"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="order" className="block text-sm font-medium mb-1.5">
              Order Number
            </label>
            <Input
              id="order"
              type="text"
              placeholder="e.g. 1234"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Finding order...
              </>
            ) : (
              "Find Order"
            )}
          </Button>

          <p className="text-xs text-muted-foreground mt-4">
            You can find your order number in your order confirmation email.
          </p>
        </form>
      )}

      {/* Step 2: Select Items */}
      {step === "select" && order && (
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Order <strong className="text-foreground">#{order.wcOrderId}</strong> placed on{" "}
            {new Date(order.orderDate).toLocaleDateString("en-US", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Select the items you wish to return:</p>
            {order.items.map((item) => {
              const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
              const isSelected = selectedItems.has(key);
              const selectedQty = selectedItems.get(key) ?? 0;

              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-lg border p-4 transition-colors cursor-pointer ${
                    isSelected ? "border-foreground/30 bg-accent/30" : "border-border"
                  }`}
                  onClick={() => toggleItem(item)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleItem(item)}
                    className="size-4 rounded border-border accent-foreground shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Package className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.price > 0
                        ? `$${item.price.toFixed(2)} each`
                        : ""}
                    </p>
                  </div>
                  {isSelected && item.qty > 1 && (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => updateQty(item, selectedQty - 1)}
                        className="size-7 rounded border text-sm hover:bg-accent flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-sm font-medium w-6 text-center tabular-nums">
                        {selectedQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item, selectedQty + 1)}
                        className="size-7 rounded border text-sm hover:bg-accent flex items-center justify-center"
                      >
                        +
                      </button>
                      <span className="text-xs text-muted-foreground ml-1">of {item.qty}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium mb-1.5">
              Reason for return <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let us know why you'd like to return these items..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setStep("lookup");
                setError("");
              }}
              className="gap-1.5"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              onClick={() => {
                setError("");
                if (selectedItems.size === 0) {
                  setError("Please select at least one item to return.");
                  return;
                }
                setStep("policy");
              }}
              className="flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Policy Acknowledgement */}
      {step === "policy" && order && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-medium mb-3">Return Policy</h2>
            <div className="rounded-lg border bg-accent/20 p-4 space-y-3 text-sm">
              <p>Please confirm you understand the following before submitting:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
                <li>Items must be <strong className="text-foreground">unused</strong> and in their <strong className="text-foreground">original packaging</strong>.</li>
                <li>Items not in their original condition may result in a <strong className="text-foreground">partial or declined refund</strong>.</li>
                <li>The <strong className="text-foreground">cost of return shipping</strong> is the customer's responsibility unless otherwise agreed.</li>
                <li>Please include your <strong className="text-foreground">order number</strong> with your return parcel.</li>
                <li>Refunds are processed once items are received and inspected at our warehouse.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium mb-2">Items being returned:</p>
            <ul className="space-y-1 text-muted-foreground">
              {order.items
                .filter((item) => {
                  const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
                  return selectedItems.has(key);
                })
                .map((item) => {
                  const key = item.vid ? `${item.pid}-${item.vid}` : `${item.pid}`;
                  const qty = selectedItems.get(key) ?? 0;
                  return (
                    <li key={key}>
                      {item.name} x{qty}
                    </li>
                  );
                })}
            </ul>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={policyAgreed}
              onChange={(e) => setPolicyAgreed(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-foreground shrink-0"
            />
            <span className="text-sm">
              I confirm that my items are in their original, unused condition with original packaging, and I understand the return policy above.
            </span>
          </label>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setStep("select");
                setError("");
                setPolicyAgreed(false);
              }}
              className="gap-1.5"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!policyAgreed || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                "Submit Return Request"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === "confirm" && order && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <div>
              <h2 className="text-lg font-medium">Return Request Submitted</h2>
              <p className="text-sm text-muted-foreground">Order #{order.wcOrderId}</p>
            </div>
          </div>

          <p className="text-sm">
            We've sent a confirmation email to <strong>{order.customerEmail}</strong> with the return instructions.
          </p>

          <div className="rounded-lg border bg-accent/20 p-5 space-y-3">
            <h3 className="text-sm font-medium">Return Address</h3>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{RETURN_ADDRESS}</p>
          </div>

          <div className="rounded-lg border bg-accent/20 p-5 space-y-3">
            <h3 className="text-sm font-medium">What to do</h3>
            <p className="text-sm text-muted-foreground">
              To help ensure a smooth return and prompt refund, please kindly ensure the knife is in its original, unused condition, and that both the original packaging and your order number are included with your return. Once your returned item is received at our warehouse, your refund will be processed promptly.
            </p>
          </div>

          <a href="/">
            <Button variant="outline">Back to Shop</Button>
          </a>
        </div>
      )}
    </div>
  );
}
