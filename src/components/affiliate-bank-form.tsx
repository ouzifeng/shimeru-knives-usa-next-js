"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, Lock } from "lucide-react";

type Masked = {
  has: boolean;
  bank_name?: string;
  account_holder?: string;
  routing_number_masked?: string;
  account_number_masked?: string;
};

export function AffiliateBankForm({ token }: { token: string }) {
  const [masked, setMasked] = useState<Masked | null>(null);
  const [editing, setEditing] = useState(false);
  const [bankName, setBankName] = useState("");
  const [holder, setHolder] = useState("");
  const [routing, setRouting] = useState("");
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/affiliate/bank?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      setMasked(data);
      setEditing(!data.has);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          bank_name: bankName,
          account_holder: holder,
          routing_number: routing,
          account_number: account,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save");
      }
      setSaved(true);
      setBankName("");
      setHolder("");
      setRouting("");
      setAccount("");
      await load();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Lock className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Payout details</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Where we send your monthly commission. Your details are sent over a secure (HTTPS)
        connection and stored <span className="font-medium text-foreground">encrypted at rest with
        AES-256</span> (the same standard banks use), never in plain text. They&apos;re kept masked
        even to our team and are only ever decrypted at the moment we process your payout. US bank
        accounts only.
      </p>

      {masked?.has && !editing ? (
        <div className="space-y-2 text-sm">
          {masked.bank_name && (
            <div className="flex justify-between border-b border-border/50 py-1">
              <span className="text-muted-foreground">Bank</span>
              <span>{masked.bank_name}</span>
            </div>
          )}
          <div className="flex justify-between border-b border-border/50 py-1">
            <span className="text-muted-foreground">Account holder</span>
            <span>{masked.account_holder}</span>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <span className="text-muted-foreground">Routing number</span>
            <span>{masked.routing_number_masked}</span>
          </div>
          <div className="flex justify-between border-b border-border/50 py-1">
            <span className="text-muted-foreground">Account number</span>
            <span>{masked.account_number_masked}</span>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="mt-1 text-xs font-medium text-primary hover:text-primary/80"
          >
            Update
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bank name</label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} required placeholder="e.g. Chase, Bank of America, Wells Fargo" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Account holder name</label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} required placeholder="Name on the account" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Routing number</label>
              <Input
                value={routing}
                onChange={(e) => setRouting(e.target.value)}
                required
                inputMode="numeric"
                placeholder="9 digits"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Account number</label>
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
                inputMode="numeric"
                placeholder="Account number"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
              {saving ? "Saving…" : "Save details"}
            </Button>
            {masked?.has && (
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
