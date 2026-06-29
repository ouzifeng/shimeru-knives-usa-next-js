"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AffiliateContractFormProps {
  token: string;
  expectedName: string;
}

export function AffiliateContractForm({ token, expectedName }: AffiliateContractFormProps) {
  const router = useRouter();
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function normalize(s: string): string {
    return s.toLowerCase().replace(/\s+/g, " ").trim();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!typedName.trim()) {
      setError("Please type your full name.");
      return;
    }
    if (normalize(typedName) !== normalize(expectedName)) {
      setError(
        `The name typed must match the name on your application (${expectedName}). Reply to the email if this is wrong.`
      );
      return;
    }
    if (!agreed) {
      setError("Please check the box to confirm you agree.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliate/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signed_name: typedName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not record signature.");
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 p-6 text-center">
        <Check className="size-10 text-emerald-700 mx-auto mb-3" />
        <p className="font-medium text-emerald-800">Signed</p>
        <p className="text-sm text-emerald-700 mt-2">
          Thanks. Your affiliate agreement is now in place. You can head to your portal to grab your
          referral link and start sharing.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded border border-border bg-card p-6">
      <div>
        <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">Sign</p>
        <p className="text-sm text-foreground/80 mb-4">
          Type your full name exactly as it appears on your application. This will serve as your
          signature.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Full name *</label>
          <Input
            required
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={expectedName}
            className="font-serif text-base"
            autoComplete="off"
          />
        </div>
      </div>

      <label className="flex gap-3 items-start cursor-pointer">
        <input
          type="checkbox"
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-4 accent-foreground shrink-0"
        />
        <span className="text-sm leading-relaxed text-foreground/80">
          I have read and agree to the Shimeru Knives Affiliate Agreement above. I understand I am
          granting Shimeru Knives a perpetual, royalty-free license to use the content I create
          (including in paid advertising) as set out in Section 8.
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
        {submitting ? "Submitting…" : "Sign agreement"}
      </Button>
    </form>
  );
}
