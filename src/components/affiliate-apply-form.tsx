"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, Plus, X } from "lucide-react";

const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Facebook", "X (Twitter)", "Other"];

const AUDIENCE_BANDS = [
  { value: "<1k", label: "Under 1,000" },
  { value: "1k-10k", label: "1,000 - 10,000" },
  { value: "10k-50k", label: "10,000 - 50,000" },
  { value: "50k-250k", label: "50,000 - 250,000" },
  { value: "250k+", label: "250,000+" },
];

const COUNTRIES = [
  "United Kingdom",
  "Ireland",
  "United States",
  "Canada",
  "Australia",
  "Other",
];

type Channel = { platform: string; handle: string };

export function AffiliateApplyForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    country: "United States",
    audience_size: "",
    prior_experience: "",
    on_camera: "",
    pitch: "",
  });
  const [channels, setChannels] = useState<Channel[]>([{ platform: "Instagram", handle: "" }]);
  const [licenseAgreed, setLicenseAgreed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addChannel = () => setChannels([...channels, { platform: "TikTok", handle: "" }]);
  const removeChannel = (i: number) => setChannels(channels.filter((_, idx) => idx !== i));
  const updateChannel = (i: number, patch: Partial<Channel>) =>
    setChannels(channels.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const filledChannels = channels.filter((c) => c.handle.trim());
    if (filledChannels.length === 0) {
      setError("Add at least one social channel.");
      return;
    }
    if (!form.audience_size) {
      setError("Please select your audience size.");
      return;
    }
    if (!form.prior_experience || !form.on_camera) {
      setError("Please answer all questions.");
      return;
    }
    if (!licenseAgreed) {
      setError("Please agree to let us use your content in our advertising.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the affiliate terms.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          social_channels: filledChannels,
          content_license_agreed: licenseAgreed,
          idempotency_key: idempotencyKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to submit application");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded border border-border bg-card p-6 text-center">
        <Check className="size-8 text-primary mx-auto mb-3" />
        <p className="font-medium">Application received</p>
        <p className="text-sm text-muted-foreground mt-1">
          Thanks for applying. We review every application personally and will email you once we
          have a decision.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Full name *</label>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email *</label>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Country *</label>
          <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v ?? "" })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Total audience size *</label>
          <Select
            value={form.audience_size}
            onValueChange={(v) => setForm({ ...form, audience_size: v ?? "" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_BANDS.map((b) => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Social channels, add as many as they like */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Social channels *</label>
        <div className="space-y-2">
          {channels.map((c, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2">
              <div className="w-full sm:w-36 sm:shrink-0">
                <Select
                  value={c.platform}
                  onValueChange={(v) => updateChannel(i, { platform: v ?? "" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-1 gap-2">
                <Input
                  value={c.handle}
                  onChange={(e) => updateChannel(i, { handle: e.target.value })}
                  placeholder="@handle or profile URL"
                  className="flex-1"
                />
                {channels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChannel(i)}
                    aria-label="Remove channel"
                    className="shrink-0 rounded-md border border-border px-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addChannel}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
        >
          <Plus className="size-3.5" /> Add another channel
        </button>
      </div>

      {/* Prior experience */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Have you done brand partnerships or affiliate / sponsored content before? *
        </label>
        <div className="flex gap-4">
          {[
            { v: "true", l: "Yes" },
            { v: "false", l: "No" },
          ].map((o) => (
            <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="prior_experience"
                checked={form.prior_experience === o.v}
                onChange={() => setForm({ ...form, prior_experience: o.v })}
                className="accent-primary"
              />
              {o.l}
            </label>
          ))}
        </div>
      </div>

      {/* On camera */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Are you comfortable showing your face and talking on camera? *
        </label>
        <div className="flex gap-4">
          {[
            { v: "yes", l: "Yes" },
            { v: "sometimes", l: "Sometimes" },
            { v: "no", l: "No" },
          ].map((o) => (
            <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="on_camera"
                checked={form.on_camera === o.v}
                onChange={() => setForm({ ...form, on_camera: o.v })}
                className="accent-primary"
              />
              {o.l}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Why would you be a good fit? (optional)
        </label>
        <textarea
          value={form.pitch}
          onChange={(e) => setForm({ ...form, pitch: e.target.value })}
          placeholder="Tell us about your content, your audience, and why you love good knives."
          rows={4}
          className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={licenseAgreed}
          onChange={(e) => setLicenseAgreed(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-foreground/80">
          I grant Shimeru Knives permission to reuse and edit the content I create for this program
          (including video) across our marketing and paid advertising, including Meta (Instagram and
          Facebook) ads, with credit where practical. *
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 accent-primary"
        />
        <span className="text-foreground/80">
          I agree to the{" "}
          <a
            href="/affiliate/terms"
            target="_blank"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            affiliate program terms
          </a>
          . *
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={submitting}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitting ? "Submitting..." : "Submit Application"}
      </Button>
    </form>
  );
}
