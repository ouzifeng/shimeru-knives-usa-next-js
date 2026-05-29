"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type SegmentKey = "all" | "vip" | "repeat" | "new" | "abandoned-only";

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All paying customers",
  vip: "VIP (5+ orders)",
  repeat: "Repeat (2-4 orders)",
  new: "New (1 order)",
  "abandoned-only": "Cart only (never bought)",
};

type Sample = { email: string; name: string | null };
type SegmentData = { count: number; sample: Sample[] };

type TemplateMeta = {
  id: string;
  name: string;
  description: string;
  subject: string;
  tagline: string | null;
};

type PriorSend = {
  id: string;
  template_id: string;
  recipient_count: number;
  segment: string;
  sent_at: string;
  status: string;
};

export default function MarketingSendPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const templateId = params.id;

  const [template, setTemplate] = useState<TemplateMeta | null>(null);
  const [priorSends, setPriorSends] = useState<PriorSend[]>([]);
  const [segments, setSegments] = useState<Record<SegmentKey, SegmentData> | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<SegmentKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
    suppressed: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/emails/marketing/templates").then((r) => r.json()),
      fetch("/api/admin/emails/marketing/segment-samples").then((r) => r.json()),
      fetch("/api/admin/emails/marketing/campaigns").then((r) => r.json()),
    ])
      .then(([tplData, segData, campData]) => {
        if (tplData.error) throw new Error(tplData.error);
        if (segData.error) throw new Error(segData.error);
        const found = (tplData.templates as TemplateMeta[]).find((t) => t.id === templateId);
        if (!found) throw new Error("Template not found");
        setTemplate(found);
        setSegments(segData as Record<SegmentKey, SegmentData>);
        if (!campData.error) {
          const filtered = (campData.campaigns as PriorSend[]).filter(
            (c) => c.template_id === templateId
          );
          setPriorSends(filtered);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [templateId]);

  const selected = segments?.[selectedSegment];
  const sample = selected?.sample ?? [];

  const utmTag = useMemo(
    () => `utm_campaign=${templateId} (auto-appended to every link)`,
    [templateId]
  );

  async function handleSend() {
    if (!template || !selected) return;
    if (selected.count === 0) {
      alert("No recipients in this segment.");
      return;
    }
    const confirmed = confirm(
      `Send "${template.name}" to ${selected.count} customers in segment "${SEGMENT_LABELS[selectedSegment]}"?\n\n` +
        `Subject: ${template.subject}\n` +
        `Via:     Postmark broadcast stream\n\n` +
        `Once you click OK this cannot be undone.`
    );
    if (!confirmed) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/emails/marketing/${templateId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: selectedSegment }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      const data = (await res.json()) as { sent: number; failed: number; suppressed: number };
      setSendResult({
        sent: data.sent,
        failed: data.failed,
        suppressed: data.suppressed ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading send confirm...
        </div>
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4 gap-1.5">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (sendResult) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Campaign sent</h1>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-emerald-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Sent
              </div>
              <p className="mt-1 text-2xl font-semibold text-emerald-800">{sendResult.sent}</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Suppressed (opted out)
              </div>
              <p className="mt-1 text-2xl font-semibold text-foreground">{sendResult.suppressed}</p>
            </div>
            <div
              className={`rounded-lg border p-4 ${sendResult.failed > 0 ? "bg-rose-50" : "bg-muted/40"}`}
            >
              <div
                className={`text-xs font-medium uppercase tracking-wide ${sendResult.failed > 0 ? "text-rose-700" : "text-muted-foreground"}`}
              >
                Failed
              </div>
              <p
                className={`mt-1 text-2xl font-semibold ${sendResult.failed > 0 ? "text-rose-800" : "text-foreground"}`}
              >
                {sendResult.failed}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Open / click stats will populate on the campaign history as Postmark events come in.
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={() => router.push("/admin?tab=email-marketing")} className="gap-1.5">
              Back to Marketing
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!template || !segments) return null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/admin?tab=email-marketing")} className="mb-4 gap-1.5 px-2">
        <ArrowLeft className="size-4" />
        Back to Marketing
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review everything below carefully. The send is one-click and goes to live customer inboxes.
        </p>
      </div>

      {priorSends.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-900">
                This template has already been sent {priorSends.length === 1 ? "once" : `${priorSends.length} times`}.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {priorSends.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    {new Date(p.sent_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    — sent to <strong>{p.recipient_count}</strong> ({p.segment}) ·{" "}
                    <span className="uppercase tracking-wide">{p.status}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-900">
                Sending again will re-deliver to customers who already received it.
                Postmark&apos;s suppression list catches unsubscribes; it does not de-duplicate.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Email preview
          </div>
          <iframe
            src={`/api/admin/emails/marketing/${templateId}/preview`}
            className="w-full"
            style={{ height: 800, border: 0 }}
            title="Email preview"
          />
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-tight">What's going out</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Subject</dt>
                <dd className="text-right">{template.subject}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Going via</dt>
                <dd>Postmark broadcast</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Campaign ID</dt>
                <dd className="font-mono text-xs">{templateId}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">UTM tag</dt>
                <dd className="text-right text-xs">{utmTag}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Recipients</h2>
            <div className="space-y-2 mb-4">
              {(Object.keys(SEGMENT_LABELS) as SegmentKey[]).map((seg) => {
                const sd = segments[seg];
                return (
                  <label
                    key={seg}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <input
                      type="radio"
                      name="segment"
                      value={seg}
                      checked={selectedSegment === seg}
                      onChange={() => setSelectedSegment(seg)}
                    />
                    <span className="flex-1">{SEGMENT_LABELS[seg]}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {sd.count}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sample of {selected?.count ? Math.min(selected.count, 10) : 0}
              </div>
              {sample.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recipients in this segment.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {sample.map((r) => (
                    <li key={r.email} className="truncate">
                      {r.name ? `${r.name} ` : ""}
                      <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
                    </li>
                  ))}
                  {selected && selected.count > sample.length && (
                    <li className="text-muted-foreground italic">
                      …and {selected.count - sample.length} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          </section>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-600">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSend}
              disabled={sending || !selected || selected.count === 0}
              size="lg"
              className="gap-2"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending
                ? "Sending..."
                : `Send to ${selected?.count ?? 0} customer${selected?.count === 1 ? "" : "s"}`}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/admin?tab=email-marketing")}
              disabled={sending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
