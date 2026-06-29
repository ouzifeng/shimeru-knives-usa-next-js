"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Copy } from "lucide-react";
import { AffiliatePayouts } from "@/components/admin/affiliate-payouts";

const SITE_URL = "https://us.shimeruknives.co.uk";

type Channel = { platform?: string; handle?: string };

type Affiliate = {
  id: string;
  code: string | null;
  name: string;
  email: string;
  country: string | null;
  social_channels: Channel[];
  audience_size: string | null;
  prior_experience: boolean | null;
  on_camera: string | null;
  content_license_agreed: boolean;
  pitch: string | null;
  status: "pending" | "approved" | "rejected" | "suspended";
  commission_pct: number;
  bank_details: boolean; // server returns a flag, not the value
  admin_notes: string | null;
  created_at: string;
  approved_at: string | null;
  contract_signed_at: string | null;
  signed_name: string | null;
  agreement_sent_at: string | null;
  stats: { clicks: number; sales: number; pending: number; approved: number; paid: number };
};

const STATUSES = ["pending", "approved", "rejected", "suspended"] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  suspended: "bg-gray-200 text-gray-700",
};

function gbp(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export function AffiliatesTab() {
  const [view, setView] = useState<"list" | "payouts">("list");
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | (typeof STATUSES)[number]>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sendingAgreementId, setSendingAgreementId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/affiliates")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load affiliates");
        return res.json();
      })
      .then((data: Affiliate[]) => setAffiliates(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/admin/affiliates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Failed: ${msg || res.statusText}`);
        return null;
      }
      return (await res.json()) as { ok: true; code: string | null };
    } finally {
      setUpdatingId(null);
    }
  }

  async function setStatus(a: Affiliate, status: Affiliate["status"]) {
    const result = await patch(a.id, { status });
    if (!result) return;
    setAffiliates((prev) =>
      prev.map((x) =>
        x.id === a.id
          ? {
              ...x,
              status,
              code: result.code ?? x.code,
              approved_at: status === "approved" ? new Date().toISOString() : x.approved_at,
            }
          : x
      )
    );
  }

  async function saveNotes(a: Affiliate) {
    const notes = editNotes[a.id] ?? a.admin_notes ?? "";
    const result = await patch(a.id, { admin_notes: notes });
    if (!result) return;
    setAffiliates((prev) => prev.map((x) => (x.id === a.id ? { ...x, admin_notes: notes } : x)));
  }

  async function saveCommission(a: Affiliate, pct: number) {
    const result = await patch(a.id, { commission_pct: pct });
    if (!result) return;
    setAffiliates((prev) => prev.map((x) => (x.id === a.id ? { ...x, commission_pct: pct } : x)));
  }

  async function sendAgreement(a: Affiliate) {
    setSendingAgreementId(a.id);
    try {
      const res = await fetch(`/api/admin/affiliates/${a.id}/send-agreement`, { method: "POST" });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Failed to send: ${msg || res.statusText}`);
        return;
      }
      const data = (await res.json()) as { alreadySigned?: boolean; agreement_sent_at?: string };
      setAffiliates((prev) =>
        prev.map((x) =>
          x.id === a.id
            ? { ...x, agreement_sent_at: data.agreement_sent_at ?? new Date().toISOString() }
            : x
        )
      );
      alert(
        data.alreadySigned
          ? `Agreement re-sent to ${a.email}. Note: they have already signed.`
          : `Agreement sent to ${a.email}.`
      );
    } finally {
      setSendingAgreementId(null);
    }
  }

  function copyLink(a: Affiliate) {
    if (!a.code) return;
    const link = `${SITE_URL}/?ref=${a.code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(a.id);
      setTimeout(() => setCopiedId((c) => (c === a.id ? null : c)), 1500);
    });
  }

  const filtered = affiliates.filter((a) => filter === "all" || a.status === filter);
  const pendingCount = affiliates.filter((a) => a.status === "pending").length;

  const viewToggle = (
    <div className="inline-flex rounded-md border border-border p-0.5">
      <button
        onClick={() => setView("list")}
        className={`rounded px-3 py-1 text-xs font-medium ${
          view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Affiliates
      </button>
      <button
        onClick={() => setView("payouts")}
        className={`rounded px-3 py-1 text-xs font-medium ${
          view === "payouts" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Payouts
      </button>
    </div>
  );

  if (view === "payouts") {
    return (
      <div className="space-y-4">
        {viewToggle}
        <AffiliatePayouts />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading affiliates…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {viewToggle}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Affiliates</h2>
          <p className="text-sm text-muted-foreground">
            {affiliates.length} total
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-700">{pendingCount} awaiting review</span>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                filter === s
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No affiliates in this view.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const expanded = expandedId === a.id;
            const busy = updatingId === a.id;
            return (
              <div key={a.id} className="rounded-lg border border-border bg-card">
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                  </div>
                  <div className="hidden sm:block text-right text-xs text-muted-foreground">
                    <div>{a.stats.clicks} clicks · {a.stats.sales} sales</div>
                    <div>{gbp(a.stats.pending + a.stats.approved)} pending/approved</div>
                  </div>
                  {a.status === "approved" && (
                    <AgreementBadge
                      signedAt={a.contract_signed_at}
                      sentAt={a.agreement_sent_at}
                    />
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      STATUS_STYLES[a.status]
                    }`}
                  >
                    {a.status}
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4 text-sm">
                    {/* Application details */}
                    <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      <Detail label="Country" value={a.country || "-"} />
                      <Detail label="Audience" value={a.audience_size || "-"} />
                      <Detail
                        label="Done this before"
                        value={a.prior_experience == null ? "-" : a.prior_experience ? "Yes" : "No"}
                      />
                      <Detail label="On camera" value={a.on_camera || "-"} />
                      <Detail
                        label="Ad licence"
                        value={a.content_license_agreed ? "Agreed" : "No"}
                      />
                      <Detail
                        label="Bank details"
                        value={a.bank_details ? "On file" : "Not provided"}
                      />
                      <Detail
                        label="Applied"
                        value={new Date(a.created_at).toLocaleDateString("en-GB")}
                      />
                      <Detail
                        label="Agreement"
                        value={
                          a.contract_signed_at
                            ? `Signed ${new Date(a.contract_signed_at).toLocaleDateString("en-GB")}`
                            : a.agreement_sent_at
                            ? `Awaiting signature (sent ${new Date(a.agreement_sent_at).toLocaleDateString("en-GB")})`
                            : "Not sent"
                        }
                      />
                    </div>

                    {/* Channels */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Channels</p>
                      <ul className="space-y-0.5">
                        {(a.social_channels ?? []).map((c, i) => (
                          <li key={i}>
                            <span className="text-muted-foreground">{c.platform}:</span>{" "}
                            {looksLikeUrl(c.handle) ? (
                              <a
                                href={c.handle}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline underline-offset-2"
                              >
                                {c.handle}
                              </a>
                            ) : (
                              <span>{c.handle}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {a.pitch && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Pitch</p>
                        <p className="whitespace-pre-wrap text-foreground/80">{a.pitch}</p>
                      </div>
                    )}

                    {/* Referral link (approved only) */}
                    {a.status === "approved" && a.code && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Referral link
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                            {SITE_URL}/?ref={a.code}
                          </code>
                          <button
                            onClick={() => copyLink(a)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted"
                          >
                            {copiedId === a.id ? (
                              <Check className="size-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            {copiedId === a.id ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Earnings */}
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="Pending" value={gbp(a.stats.pending)} />
                      <Stat label="Approved" value={gbp(a.stats.approved)} />
                      <Stat label="Paid" value={gbp(a.stats.paid)} />
                    </div>

                    {/* Payout + shipping (decrypted, admin-only) */}
                    <AffiliateContact affiliateId={a.id} />

                    {/* Commission % */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Commission %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        defaultValue={a.commission_pct}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isNaN(v) && v !== a.commission_pct) saveCommission(a, v);
                        }}
                        className="w-20 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                      />
                    </div>

                    {/* Admin notes */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Internal notes
                      </label>
                      <textarea
                        value={editNotes[a.id] ?? a.admin_notes ?? ""}
                        onChange={(e) => setEditNotes({ ...editNotes, [a.id]: e.target.value })}
                        rows={2}
                        className="mt-1 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => saveNotes(a)}
                        disabled={busy}
                        className="mt-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        Save notes
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      {a.status !== "approved" && (
                        <button
                          onClick={() => setStatus(a, "approved")}
                          disabled={busy}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {a.status !== "rejected" && (
                        <button
                          onClick={() => setStatus(a, "rejected")}
                          disabled={busy}
                          className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                      {a.status === "approved" && (
                        <button
                          onClick={() => setStatus(a, "suspended")}
                          disabled={busy}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}
                      {a.status === "approved" && !a.contract_signed_at && (
                        <button
                          onClick={() => sendAgreement(a)}
                          disabled={sendingAgreementId === a.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {sendingAgreementId === a.id && (
                            <Loader2 className="size-3.5 animate-spin" />
                          )}
                          {a.agreement_sent_at ? "Resend agreement" : "Send agreement"}
                        </button>
                      )}
                    </div>

                    {/* Messages */}
                    <AffiliateThread affiliateId={a.id} affiliateName={a.name} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function looksLikeUrl(s?: string) {
  return !!s && /^https?:\/\//i.test(s);
}

function AgreementBadge({
  signedAt,
  sentAt,
}: {
  signedAt: string | null;
  sentAt: string | null;
}) {
  if (signedAt) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        Signed
      </span>
    );
  }
  if (sentAt) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        Awaiting signature
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
      Unsigned
    </span>
  );
}

type ContactBank = {
  bank_name?: string;
  account_holder: string;
  routing_number: string;
  account_number: string;
};
type ContactShipping = {
  full_name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

function AffiliateContact({ affiliateId }: { affiliateId: string }) {
  const [data, setData] = useState<{ bank: ContactBank | null; shipping: ContactShipping | null } | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/affiliates/${affiliateId}/contact`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setData(d);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [affiliateId]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
        <p className="mb-1.5 font-medium uppercase tracking-wide text-muted-foreground">
          Payout (bank)
        </p>
        {loading ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : data?.bank ? (
          <div className="space-y-0.5">
            {data.bank.bank_name && <div>{data.bank.bank_name}</div>}
            <div>{data.bank.account_holder}</div>
            <div>Routing {data.bank.routing_number}</div>
            <div>Acct {data.bank.account_number}</div>
          </div>
        ) : (
          <span className="text-amber-700">Not provided</span>
        )}
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
        <p className="mb-1.5 font-medium uppercase tracking-wide text-muted-foreground">
          Shipping address
        </p>
        {loading ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : data?.shipping ? (
          <div className="space-y-0.5">
            <div>{data.shipping.full_name}</div>
            <div>{data.shipping.line1}</div>
            {data.shipping.line2 && <div>{data.shipping.line2}</div>}
            <div>
              {data.shipping.city}, {data.shipping.state} {data.shipping.zip}
            </div>
            <div>{data.shipping.country}</div>
          </div>
        ) : (
          <span className="text-amber-700">Not provided</span>
        )}
      </div>
    </div>
  );
}

type ThreadAttachment = {
  name: string;
  key: string;
  content_type: string;
  size: number;
  kind?: "video" | "image" | "file";
  url?: string;
};

type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound" | "note";
  from_addr: string | null;
  content_text: string | null;
  attachments: ThreadAttachment[];
  created_at: string;
};

const QUICK_TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: "Thanks for applying",
    subject: "Thanks for applying to Shimeru Knives",
    body: "Hi,\n\nThanks for applying to our affiliate program. We're reviewing your channels now and will be back in touch shortly.\n\nBest,\nShimeru Knives",
  },
  {
    label: "Content we expect",
    subject: "The kind of content we're after",
    body: "Hi,\n\nQuick note on the content we love: short, punchy video of you actually using the knife, good lighting, your honest take. Please upload a draft in your portal before posting so we can approve it.\n\nBest,\nShimeru Knives",
  },
  {
    label: "Shipping your knife",
    subject: "Your Shimeru knife is on the way",
    body: "Hi,\n\nGreat news, we're shipping your knife now. Once it arrives, film your content and upload a draft in your portal for approval before you post.\n\nBest,\nShimeru Knives",
  },
];

function AffiliateThread({
  affiliateId,
  affiliateName,
}: {
  affiliateId: string;
  affiliateName: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/affiliates/${affiliateId}/messages`);
    if (res.ok) setMessages(await res.json());
    setLoading(false);
  }, [affiliateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(kind: "message" | "note") {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/affiliates/${affiliateId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body, subject, kind }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Failed: ${msg || res.statusText}`);
        return;
      }
      setBody("");
      setSubject("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Messages
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No messages yet.</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-md border p-2 text-xs ${
                m.direction === "outbound"
                  ? "border-border bg-muted/40"
                  : m.direction === "note"
                  ? "border-amber-200 bg-amber-50"
                  : "border-primary/20 bg-primary/5"
              }`}
            >
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.direction === "outbound"
                  ? "You → affiliate"
                  : m.direction === "note"
                  ? "Internal note"
                  : `${affiliateName} → you`}{" "}
                · {new Date(m.created_at).toLocaleString("en-GB")}
              </p>
              {m.content_text && (
                <p className="whitespace-pre-wrap text-foreground/90">{m.content_text}</p>
              )}
              {m.attachments?.length > 0 && (
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {m.attachments.map((a) => (
                    <ThreadAttachmentView key={a.key} a={a} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => {
                setSubject(t.subject);
                setBody(t.body);
              }}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject (optional)"
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Write a message to the affiliate…"
          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={() => send("message")}
            disabled={busy || !body.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send email"}
          </button>
          <button
            onClick={() => send("note")}
            disabled={busy || !body.trim()}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            Save as note
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadAttachmentView({ a }: { a: ThreadAttachment }) {
  const isVideo = a.kind === "video" || a.content_type.startsWith("video/");
  const isImage = a.kind === "image" || a.content_type.startsWith("image/");
  if (isVideo) {
    return (
      <video controls preload="metadata" src={a.url} className="w-full rounded border border-border">
        <track kind="captions" />
      </video>
    );
  }
  if (isImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt={a.name} className="w-full rounded border border-border" />;
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate rounded border border-border px-2 py-1 text-primary underline"
    >
      {a.name}
    </a>
  );
}
