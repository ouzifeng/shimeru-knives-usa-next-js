import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knife Care Guide",
  description: "How to care for your Japanese kitchen knife. Simple 3-step guide: rinse, dry, store.",
};

export default function KnifeCarePage() {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12 sm:py-16">
      <h1 className="font-serif text-3xl sm:text-4xl font-light tracking-tight mb-4">
        Knife Care Guide
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        No special maintenance. No fussy rituals. Just three simple steps.
      </p>

      <img
        src="/knife-care.jpg"
        alt="Knife care guide — Rinse, Dry, Store"
        className="w-full rounded mb-10"
      />

      <div className="space-y-10 text-sm leading-relaxed text-foreground/80">
        <section>
          <h2 className="text-base font-medium text-foreground mb-2">Step 1 — Rinse</h2>
          <p>
            Warm water and mild soap after each use. Never put your knife in the dishwasher — the
            harsh detergents and jostling will damage the edge and handle. A quick hand wash takes
            seconds and keeps your blade in perfect condition.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-2">Step 2 — Dry</h2>
          <p>
            Towel dry immediately after washing. Don&apos;t leave it wet or sitting in the sink —
            even stainless steel can develop spots or discoloration if left damp. A quick wipe with
            a clean cloth is all it takes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-medium text-foreground mb-2">Step 3 — Store</h2>
          <p>
            Use a knife block, magnetic strip, or blade guard. Never toss your knife loose in a
            drawer — it dulls the edge, damages the blade, and is a safety hazard. A proper storage
            solution keeps your knife sharp and ready.
          </p>
        </section>

        <section className="border-t border-border pt-8">
          <h2 className="text-base font-medium text-foreground mb-3">Sharpening</h2>
          <p className="mb-4">
            Japanese knives hold their edge far longer than Western knives thanks to harder steel
            (60+ HRC). Most home cooks will only need to sharpen every few months with regular use.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Honing rod:</strong> A quick realignment before each use keeps the edge
              straight. Use a ceramic rod rather than steel — it&apos;s gentler on harder Japanese
              blades.
            </li>
            <li>
              <strong>Whetstone:</strong> For proper sharpening, use a 1000/3000 grit combination
              whetstone. Maintain the original edge angle (typically 15° per side for Japanese
              knives).
            </li>
            <li>
              <strong>Rolling sharpener:</strong> If you&apos;re not confident with a whetstone, a
              rolling knife sharpener is a foolproof alternative — check out our{" "}
              <a href="/product?category=sharpener" className="text-primary underline underline-offset-2 hover:text-primary/80">
                sharpening tools
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="border-t border-border pt-8">
          <h2 className="text-base font-medium text-foreground mb-3">What to Avoid</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Dishwashers</strong> — heat, harsh chemicals, and rattling against other items
              will ruin your edge and handle
            </li>
            <li>
              <strong>Glass or ceramic cutting boards</strong> — these destroy edges instantly. Use
              wood or soft plastic boards
            </li>
            <li>
              <strong>Cutting frozen food or bones</strong> — Japanese blades are hard but thin.
              Use a cleaver or deba for heavy tasks
            </li>
            <li>
              <strong>Twisting or prying</strong> — these knives are designed for slicing, not
              leveraging. Lateral force can chip the blade
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
