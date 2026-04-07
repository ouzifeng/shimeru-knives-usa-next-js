import Link from "next/link";

export function KnifeGuideCta() {
  return (
    <section className="border-t border-b border-border bg-muted/30">
      <div className="container mx-auto px-4 lg:px-8 py-10 sm:py-14 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div>
          <p className="text-sm tracking-[0.25em] uppercase text-muted-foreground mb-1.5">
            Not sure which knife?
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl font-light">
            Take our 60-second Knife Guide
          </h2>
          <p className="text-base text-muted-foreground mt-2 max-w-md leading-relaxed">
            Answer a few quick questions about how you cook, and we&apos;ll match you with the perfect blade.
          </p>
        </div>
        <Link
          href="/knife-guide"
          className="shrink-0 bg-foreground text-background px-7 py-3 text-[12px] tracking-[0.2em] uppercase font-semibold hover:opacity-90 transition-opacity"
        >
          Help Me Choose
        </Link>
      </div>
    </section>
  );
}
