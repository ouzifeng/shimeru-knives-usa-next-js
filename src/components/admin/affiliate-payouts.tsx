"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Bank = { bank_name?: string; account_holder: string; routing_number: string; account_number: string };

type Payable = {
  affiliate_id: string;
  name: string;
  email: string;
  code: string | null;
  total: number;
  count: number;
  bank: Bank | null;
  has_bank: boolean;
};

type HistoryRow = {
  id: string;
  affiliate_name: string;
  period: string;
  total_amount: number;
  commission_count: number;
  status: string;
  paid_at: string | null;
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export function AffiliatePayouts() {
  const [payable, setPayable] = useState<Payable[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/affiliate-payouts");
    if (res.ok) {
      const data = await res.json();
      setPayable(data.payable ?? []);
      setHistory(data.history ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaid(p: Payable) {
    if (
      !confirm(
        `Confirm you have transferred ${usd(p.total)} to ${p.name}. This marks ${p.count} commission(s) as paid.`
      )
    )
      return;
    setPayingId(p.affiliate_id);
    try {
      const res = await fetch("/api/admin/affiliate-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliate_id: p.affiliate_id }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Failed: ${error}`);
        return;
      }
      await load();
    } finally {
      setPayingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading payouts…
      </div>
    );
  }

  const totalOwed = payable.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Payouts due</h2>
        <p className="text-sm text-muted-foreground">
          {payable.length} affiliate{payable.length === 1 ? "" : "s"} owed · {usd(totalOwed)} total
          (approved commissions, not yet paid)
        </p>
      </div>

      {payable.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing due right now.</p>
      ) : (
        <div className="space-y-2">
          {payable.map((p) => (
            <div key={p.affiliate_id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">{usd(p.total)}</span>{" "}
                    <span className="text-muted-foreground">· {p.count} sale{p.count === 1 ? "" : "s"}</span>
                  </p>
                </div>
                <button
                  onClick={() => markPaid(p)}
                  disabled={payingId === p.affiliate_id || !p.has_bank}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {payingId === p.affiliate_id ? "Marking…" : "Mark paid"}
                </button>
              </div>

              {/* Bank details for the transfer */}
              <div className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs">
                {p.bank ? (
                  <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-3">
                    {p.bank.bank_name && (
                      <span>
                        <span className="text-muted-foreground">Bank: </span>
                        {p.bank.bank_name}
                      </span>
                    )}
                    <span>
                      <span className="text-muted-foreground">Holder: </span>
                      {p.bank.account_holder}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Routing: </span>
                      {p.bank.routing_number}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Account: </span>
                      {p.bank.account_number}
                    </span>
                  </div>
                ) : (
                  <span className="text-amber-700">
                    No bank details on file — they need to add them in their portal before you can pay.
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="mb-2 text-sm font-semibold tracking-tight">Payout history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Affiliate</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Sales</th>
                  <th className="py-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-border/50">
                    <td className="py-2 pr-4">{h.affiliate_name}</td>
                    <td className="py-2 pr-4">{h.period}</td>
                    <td className="py-2 pr-4">{usd(Number(h.total_amount))}</td>
                    <td className="py-2 pr-4">{h.commission_count}</td>
                    <td className="py-2 text-muted-foreground">
                      {h.paid_at ? new Date(h.paid_at).toLocaleDateString("en-US") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
