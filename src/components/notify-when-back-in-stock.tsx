"use client";

import { useState, type FormEvent } from "react";

export function NotifyWhenBackInStock({
  productId,
  productName,
  etaLabel,
}: {
  productId: number;
  productName: string;
  etaLabel: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setErrorMsg("Please enter a valid email.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/stock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "Could not save your request. Try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setErrorMsg("Network error. Try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="border-t border-border pt-5 sm:pt-6">
        <p className="text-sm text-green-700 font-medium">
          Got it — we&rsquo;ll email you when {productName} is back in stock.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-5 sm:pt-6">
      <p className="text-sm text-muted-foreground mb-3">
        Expected back in stock around{" "}
        <span className="text-foreground font-medium">{etaLabel}</span>. Want an
        email when it arrives?
      </p>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-label="Email address"
          className="flex-1 min-w-0 border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
          disabled={status === "submitting"}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="px-4 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors shrink-0"
        >
          {status === "submitting" ? "Saving…" : "Notify me"}
        </button>
      </form>
      {status === "error" && errorMsg && (
        <p className="text-xs text-red-600 mt-2">{errorMsg}</p>
      )}
    </div>
  );
}
