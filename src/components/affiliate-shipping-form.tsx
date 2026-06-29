"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, Truck } from "lucide-react";

type ShippingAddress = {
  full_name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

const EMPTY: ShippingAddress = {
  full_name: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  country: "United States",
};

export function AffiliateShippingForm({ token }: { token: string }) {
  const [saved, setSaved] = useState<ShippingAddress | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ShippingAddress>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/affiliate/shipping?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      setSaved(data.address ?? null);
      setEditing(!data.has);
      if (data.address) setForm({ ...EMPTY, ...data.address });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function set<K extends keyof ShippingAddress>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate/shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save");
      }
      setJustSaved(true);
      await load();
      setEditing(false);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Truck className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Shipping address</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Where we post product for you to feature. US addresses only.
      </p>

      {saved && !editing ? (
        <div className="space-y-1 text-sm">
          <p>{saved.full_name}</p>
          <p>{saved.line1}</p>
          {saved.line2 && <p>{saved.line2}</p>}
          <p>
            {saved.city}, {saved.state} {saved.zip}
          </p>
          <p>{saved.country}</p>
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
            <label className="text-xs font-medium text-muted-foreground">Recipient name</label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Address line 1</label>
            <Input value={form.line1} onChange={(e) => set("line1", e.target.value)} required placeholder="Street address" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Address line 2 (optional)</label>
            <Input value={form.line2} onChange={(e) => set("line2", e.target.value)} placeholder="Apt, suite, unit, etc." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-medium text-muted-foreground">City</label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} required />
            </div>
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-medium text-muted-foreground">State</label>
              <Input value={form.state} onChange={(e) => set("state", e.target.value)} required placeholder="CA" />
            </div>
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-medium text-muted-foreground">ZIP</label>
              <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} required />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="size-4 animate-spin" /> : justSaved ? <Check className="size-4" /> : null}
              {saving ? "Saving…" : "Save address"}
            </Button>
            {saved && (
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
