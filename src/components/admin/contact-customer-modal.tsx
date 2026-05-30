"use client";

// Reusable "Contact customer" modal used on order detail + customer detail
// pages. Submits to /api/admin/support/tickets/create-outbound which creates
// a support ticket, sends the email via Postmark, and threads any reply back
// into the same ticket via the inbound webhook.

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIGNATURE = `Thanks,
Shimeru Knives
sales@us.shimeruknives.co.uk
www.us.shimeruknives.co.uk`;

type Props = {
  open: boolean;
  onClose: () => void;
  customerEmail: string;
  customerName?: string | null;
  orderNumber?: string | null;
  onSent?: (ticketId: string) => void;
};

function firstNameFrom(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    const fn = name.trim().split(/\s+/)[0];
    if (fn) return fn;
  }
  const local = email.split("@")[0] ?? "";
  if (!local) return "there";
  const cleaned = local.replace(/[._-]+/g, " ").trim().split(/\s+/)[0];
  if (!cleaned) return "there";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function ContactCustomerModal({
  open,
  onClose,
  customerEmail,
  customerName,
  orderNumber,
  onSent,
}: Props) {
  const firstName = useMemo(
    () => firstNameFrom(customerName, customerEmail),
    [customerName, customerEmail]
  );
  const initialBody = useMemo(
    () => `Hi ${firstName},\n\n\n\n${SIGNATURE}`,
    [firstName]
  );

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open so reopening for a different customer pre-fills correctly.
  useEffect(() => {
    if (open) {
      setSubject("");
      setBody(initialBody);
      setError(null);
      setSending(false);
    }
  }, [open, initialBody]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, onClose]);

  if (!open) return null;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support/tickets/create-outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_email: customerEmail,
          customer_name: customerName ?? null,
          order_number: orderNumber ?? null,
          subject: subject.trim(),
          message: body,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; ticket_id?: string; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Send failed (${res.status})`);
      }
      onSent?.(json.ticket_id ?? "");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      setSending(false);
    }
  };

  const canSend = !!subject.trim() && !!body.trim() && !sending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!sending) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Contact customer</h3>
            <p className="text-xs text-muted-foreground">
              {customerName ? `${customerName} · ` : ""}
              {customerEmail}
              {orderNumber ? ` · Order #${orderNumber}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Subject
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={orderNumber ? `About your order #${orderNumber}` : "Subject"}
              className="mt-1 h-9 text-sm"
              disabled={sending}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              disabled={sending}
              className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm font-mono resize-y disabled:opacity-50"
            />
          </div>
          {error && (
            <p className="text-xs text-rose-600">{error}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              A support ticket will be created so replies thread back here.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onClose} disabled={sending}>
                Cancel
              </Button>
              <Button size="sm" onClick={send} disabled={!canSend}>
                {sending ? (
                  <>
                    <Loader2 className="mr-1.5 size-3 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
