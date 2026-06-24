import Link from "next/link";
import Image from "next/image";

type SetSwatch = { slug: string; name: string; image: string | null };

// Shows the sibling knife sets as thumbnail swatches. They're separate
// products, but presenting them like variations lets the customer flick
// between the colourways. The current set is ringed; the rest are links.
export function SetSwitcher({ sets, currentSlug }: { sets: SetSwatch[]; currentSlug: string }) {
  if (!sets || sets.length < 2) return null;

  return (
    <div className="space-y-2.5">
      <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Choose your set</p>
      <div className="flex flex-wrap gap-3">
        {sets.map((s) => {
          const active = s.slug === currentSlug;
          const label = (s.name || "").trim().split(/\s+/)[0] || "Set";
          const thumb = (
            <>
              <span
                className={`relative block w-14 h-14 overflow-hidden rounded-md bg-muted transition-all ${
                  active
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "ring-1 ring-border hover:ring-foreground/40"
                }`}
              >
                {s.image && (
                  <Image src={s.image} alt={label} fill sizes="56px" className="object-cover" />
                )}
              </span>
              <span
                className={`mt-1 block text-center text-[11px] leading-tight ${
                  active ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </>
          );

          return active ? (
            <div key={s.slug} className="w-14 shrink-0" title={s.name} aria-current="true">
              {thumb}
            </div>
          ) : (
            <Link key={s.slug} href={`/product/${s.slug}`} prefetch className="w-14 shrink-0" title={s.name}>
              {thumb}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
