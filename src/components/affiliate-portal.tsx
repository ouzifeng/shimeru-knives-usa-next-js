"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip, X, Upload } from "lucide-react";

type Attachment = {
  name: string;
  key: string;
  content_type: string;
  size: number;
  kind?: "video" | "image" | "file";
  url?: string;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content_text: string | null;
  created_at: string;
  attachments: Attachment[];
};

type Queued = {
  id: string;
  file: File;
  progress: number; // 0-100
  done: boolean;
  error?: string;
  attachment?: Attachment;
};

function fmtSize(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

type Stats = { clicks: number; sales: number; pending: number; approved: number; paid: number };

function gbp(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}

export function AffiliatePortal({ token }: { token: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [queue, setQueue] = useState<Queued[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadThread = useCallback(async () => {
    const res = await fetch(`/api/affiliate/portal?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
      setStats(data.stats ?? null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  // Upload a single file directly to R2 via presigned PUT, tracking progress.
  const uploadFile = useCallback(
    async (q: Queued) => {
      try {
        const presignRes = await fetch("/api/affiliate/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            filename: q.file.name,
            content_type: q.file.type || "application/octet-stream",
            size: q.file.size,
          }),
        });
        if (!presignRes.ok) {
          const { error: msg } = await presignRes.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(msg || "Upload failed");
        }
        const { url, key } = await presignRes.json();

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", q.file.type || "application/octet-stream");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setQueue((prev) => prev.map((x) => (x.id === q.id ? { ...x, progress: pct } : x)));
            }
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed (${xhr.status})`));
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(q.file);
        });

        const attachment: Attachment = {
          name: q.file.name,
          key,
          content_type: q.file.type || "application/octet-stream",
          size: q.file.size,
        };
        setQueue((prev) =>
          prev.map((x) => (x.id === q.id ? { ...x, progress: 100, done: true, attachment } : x))
        );
      } catch (err) {
        setQueue((prev) =>
          prev.map((x) =>
            x.id === q.id ? { ...x, error: err instanceof Error ? err.message : "Failed" } : x
          )
        );
      }
    },
    [token]
  );

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const newItems: Queued[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      progress: 0,
      done: false,
    }));
    setQueue((prev) => [...prev, ...newItems]);
    newItems.forEach(uploadFile);
  }

  function removeQueued(id: string) {
    setQueue((prev) => prev.filter((x) => x.id !== id));
  }

  const uploading = queue.some((q) => !q.done && !q.error);

  async function send() {
    setError(null);
    const attachments = queue.filter((q) => q.done && q.attachment).map((q) => q.attachment!);
    if (!text.trim() && attachments.length === 0) {
      setError("Add a message or a file first.");
      return;
    }
    if (uploading) {
      setError("Wait for uploads to finish.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/affiliate/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, text: text.trim(), attachments }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Failed to send" }));
        throw new Error(msg || "Failed to send");
      }
      setText("");
      setQueue([]);
      await loadThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatCard label="Clicks" value={String(stats.clicks)} />
          <StatCard label="Sales" value={String(stats.sales)} />
          <StatCard label="Pending" value={gbp(stats.pending)} />
          <StatCard label="Approved" value={gbp(stats.approved)} />
          <StatCard label="Paid" value={gbp(stats.paid)} />
        </div>
      )}

      {/* Thread */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet. Say hello or upload your content below.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${
                m.direction === "outbound"
                  ? "border-border bg-card"
                  : "border-primary/20 bg-primary/5 ml-6"
              }`}
            >
              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {m.direction === "outbound" ? "Shimeru Knives" : "You"} ·{" "}
                {new Date(m.created_at).toLocaleString("en-GB")}
              </p>
              {m.content_text && <p className="whitespace-pre-wrap text-foreground/90">{m.content_text}</p>}
              {m.attachments.length > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {m.attachments.map((a) => (
                    <AttachmentView key={a.key} a={a} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Write a message…"
          className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        {queue.length > 0 && (
          <ul className="space-y-1.5">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{q.file.name}</span>
                <span className="text-muted-foreground">{fmtSize(q.file.size)}</span>
                {q.error ? (
                  <span className="text-rose-600">{q.error}</span>
                ) : q.done ? (
                  <span className="text-emerald-600">ready</span>
                ) : (
                  <span className="w-24">
                    <span className="block h-1.5 rounded bg-muted">
                      <span
                        className="block h-1.5 rounded bg-primary transition-all"
                        style={{ width: `${q.progress}%` }}
                      />
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeQueued(q.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="size-4" /> Attach photo / video
          </button>
          <Button
            onClick={send}
            disabled={sending || uploading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-medium">{value}</div>
    </div>
  );
}

function AttachmentView({ a }: { a: Attachment }) {
  if (a.kind === "video" || a.content_type.startsWith("video/")) {
    return (
      <video controls preload="metadata" src={a.url} className="w-full rounded-md border border-border">
        <track kind="captions" />
      </video>
    );
  }
  if (a.kind === "image" || a.content_type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.url} alt={a.name} className="w-full rounded-md border border-border" />;
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate rounded-md border border-border px-2 py-1.5 text-xs text-primary underline"
    >
      {a.name}
    </a>
  );
}
