import type { Metadata } from "next";
import Link from "next/link";
import { Mon } from "@/components/mon";
import { storeConfig } from "../../../../store.config";

// For-show authenticity page: any code renders as genuine. No lookup, no database.
// The long random-looking code in the URL just makes each certificate feel personal.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify authenticity",
  description: "Confirm your Shimeru knife is genuine.",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ref = decodeURIComponent(code || "").toUpperCase();
  const domain = storeConfig.url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-16 text-center sm:py-20">
      <Mon className="h-16 w-16 text-foreground" />

      <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3.5 py-1.5">
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          Authenticity confirmed
        </span>
      </div>

      <h1 className="mt-6 font-serif text-3xl font-light leading-tight tracking-tight text-foreground sm:text-4xl">
        This is a genuine Shimeru knife
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-foreground/70">
        Thank you for choosing Shimeru. You are now part of a community that values a
        proper edge. Keep yours sharp and it will serve you for years.
      </p>

      <div className="mt-8 w-full rounded-xl border border-border bg-muted/40 px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Certificate No.
        </div>
        <div className="mt-1.5 font-mono text-sm tracking-[0.18em] text-foreground break-all">
          {ref || "SHIMERU"}
        </div>
      </div>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/knife-care"
          className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          Care guide
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Explore the collection
        </Link>
      </div>

      <p className="mt-10 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {domain}
      </p>
    </div>
  );
}
