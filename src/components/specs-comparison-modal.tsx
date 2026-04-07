"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
   Steel Types — Encyclopedia Data
   ========================================================================= */

interface SteelEntry {
  name: string;
  japanese?: string;
  hrc: string;
  edgeRetention: string;
  corrosionResistance: string;
  easeOfSharpening: string;
  description: string;
  bestFor: string;
  tags: string[];
}

const STEEL_TYPES: SteelEntry[] = [
  {
    name: "VG-10",
    japanese: "V金10号",
    hrc: "60–61",
    edgeRetention: "Excellent",
    corrosionResistance: "Very Good",
    easeOfSharpening: "Moderate",
    description:
      "Premium Japanese stainless steel with high carbon content. The gold standard for Japanese kitchen knives — holds a razor edge while resisting corrosion.",
    bestFor: "Everyday precision cutting",
    tags: ["stainless", "professional"],
  },
  {
    name: "Damascus (VG-10 Core)",
    japanese: "ダマスカス",
    hrc: "60–61",
    edgeRetention: "Excellent",
    corrosionResistance: "Very Good",
    easeOfSharpening: "Moderate",
    description:
      "VG-10 core wrapped in alternating layers of soft and hard steel, creating the signature wavy pattern. Combines performance with striking aesthetics.",
    bestFor: "Those who want beauty and performance",
    tags: ["layered", "decorative", "stainless"],
  },
  {
    name: "67-Layer Damascus",
    japanese: "67層ダマスカス",
    hrc: "60–62",
    edgeRetention: "Excellent",
    corrosionResistance: "Very Good",
    easeOfSharpening: "Moderate",
    description:
      "67 alternating layers of steel folded around a hard core. More layers means finer, more intricate patterns and slightly improved flexibility.",
    bestFor: "Premium knives with unique patterns",
    tags: ["layered", "premium", "stainless"],
  },
  {
    name: "AUS-10",
    japanese: "AUS-10",
    hrc: "59–60",
    edgeRetention: "Very Good",
    corrosionResistance: "Good",
    easeOfSharpening: "Easy",
    description:
      "Japanese stainless steel similar to VG-10 but slightly softer. Easier to sharpen at home while still maintaining a good edge.",
    bestFor: "Home cooks wanting easy maintenance",
    tags: ["stainless", "beginner-friendly"],
  },
  {
    name: "High Carbon Steel",
    japanese: "炭素鋼",
    hrc: "62–65",
    edgeRetention: "Outstanding",
    corrosionResistance: "Low",
    easeOfSharpening: "Very Easy",
    description:
      "Traditional carbon steel used by professional Japanese chefs. Takes the sharpest edge possible but requires diligent care to prevent rust and patina.",
    bestFor: "Professional chefs who maintain their tools",
    tags: ["carbon", "traditional", "professional"],
  },
  {
    name: "Stainless Steel",
    japanese: "ステンレス",
    hrc: "56–58",
    edgeRetention: "Good",
    corrosionResistance: "Excellent",
    easeOfSharpening: "Very Easy",
    description:
      "General-purpose stainless steel. Won't rust or stain, very forgiving for beginners. Doesn't hold as keen an edge as premium steels.",
    bestFor: "Low-maintenance everyday use",
    tags: ["stainless", "beginner-friendly", "low-maintenance"],
  },
];

/* ============================================================================
   Knife Types — Encyclopedia Data
   ========================================================================= */

interface KnifeEntry {
  name: string;
  japanese: string;
  profile: string;
  bladeLength: string;
  weight: string;
  description: string;
  bestFor: string;
  technique: string;
  tags: string[];
}

const KNIFE_TYPES: KnifeEntry[] = [
  {
    name: "Gyuto",
    japanese: "牛刀",
    profile: "Curved belly, pointed tip",
    bladeLength: "180–270mm",
    weight: "Medium",
    description:
      "The Japanese chef's knife — equivalent to a Western chef's knife but thinner and lighter. Versatile workhorse that excels at rocking and push-cutting.",
    bestFor: "Everything — meat, fish, vegetables",
    technique: "Rock chop, push cut, pull cut",
    tags: ["versatile", "essential", "professional"],
  },
  {
    name: "Santoku",
    japanese: "三徳包丁",
    profile: "Flat belly, sheepsfoot tip",
    bladeLength: "160–180mm",
    weight: "Light",
    description:
      "\"Three virtues\" knife — designed for meat, fish, and vegetables. Flatter profile than a Gyuto with a more approachable size. Japan's most popular home kitchen knife.",
    bestFor: "Slicing, dicing, and mincing",
    technique: "Push cut, tap chop",
    tags: ["versatile", "essential", "beginner-friendly"],
  },
  {
    name: "Nakiri",
    japanese: "菜切り包丁",
    profile: "Flat, rectangular blade",
    bladeLength: "160–180mm",
    weight: "Medium",
    description:
      "Dedicated vegetable knife with a perfectly flat edge for full-contact board cuts. The thin blade glides through dense vegetables with minimal resistance.",
    bestFor: "All vegetables — julienne, brunoise, rough chop",
    technique: "Push cut, up-and-down chop",
    tags: ["vegetable", "specialist"],
  },
  {
    name: "Kiritsuke",
    japanese: "切付",
    profile: "Flat with angled \"clipped\" tip",
    bladeLength: "210–270mm",
    weight: "Medium-Heavy",
    description:
      "A hybrid between a Yanagiba and Usuba — the executive chef's knife in Japan. The angular tip and long flat edge handle both precise work and broad cuts.",
    bestFor: "Slicing fish, cutting vegetables, presentation",
    technique: "Pull cut, push cut, decorative cuts",
    tags: ["professional", "prestige", "hybrid"],
  },
  {
    name: "Bunka",
    japanese: "文化包丁",
    profile: "Flat with reverse-tanto tip",
    bladeLength: "165–180mm",
    weight: "Light-Medium",
    description:
      "Similar to Santoku but with a distinctive angular \"k-tip\" that excels at detail work. The aggressive tip geometry makes it ideal for precision tasks.",
    bestFor: "Precision cuts, scoring, fine dicing",
    technique: "Push cut, tip work, tap chop",
    tags: ["versatile", "precision", "modern"],
  },
  {
    name: "Petty",
    japanese: "ペティナイフ",
    profile: "Small, narrow blade",
    bladeLength: "120–150mm",
    weight: "Very Light",
    description:
      "Japanese utility/paring knife for detailed work. Nimble enough for in-hand peeling yet substantial enough for small board work.",
    bestFor: "Peeling, trimming, garnish, small fruits",
    technique: "In-hand cuts, fine tip work",
    tags: ["utility", "essential", "precision"],
  },
  {
    name: "Deba",
    japanese: "出刃包丁",
    profile: "Thick, heavy, single bevel",
    bladeLength: "150–210mm",
    weight: "Heavy",
    description:
      "Traditional Japanese fish butchery knife. Thick spine and heavy weight for breaking down whole fish through cartilage and bone. Single-bevel for clean cuts.",
    bestFor: "Fish butchery, breaking poultry joints",
    technique: "Heel strikes, pull cuts through bone",
    tags: ["specialist", "traditional", "fish"],
  },
  {
    name: "Sujihiki",
    japanese: "筋引き",
    profile: "Long, narrow, double bevel",
    bladeLength: "240–300mm",
    weight: "Light-Medium",
    description:
      "Japanese slicing knife — the double-bevel alternative to a Yanagiba. Long, narrow blade for clean, single-stroke slicing of proteins.",
    bestFor: "Slicing roasts, sashimi, charcuterie",
    technique: "Long pull cuts, single-pass slicing",
    tags: ["specialist", "slicing", "professional"],
  },
];

/* ============================================================================
   Rating Bar Component
   ========================================================================= */

function RatingBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-muted-foreground w-24 shrink-0 text-right">{label}</span>
      <div className="flex gap-0.5 flex-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 transition-colors",
              i < value ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   Steel Rating Helper
   ========================================================================= */

function steelRating(text: string): number {
  switch (text) {
    case "Outstanding": return 5;
    case "Excellent": return 4;
    case "Very Good": return 3;
    case "Good": return 2;
    case "Moderate": return 3;
    case "Easy": return 4;
    case "Very Easy": return 5;
    case "Low": return 1;
    default: return 2;
  }
}

/* ============================================================================
   Normalize steel_type from product to match STEEL_TYPES.name
   ========================================================================= */

function matchSteel(productValue: string): string | null {
  const lower = productValue.toLowerCase();
  for (const s of STEEL_TYPES) {
    if (lower.includes(s.name.toLowerCase())) return s.name;
    // Match partial — "damascus" in "Damascus Steel (VG10 Core)"
    if (s.name.toLowerCase().includes("damascus") && lower.includes("damascus")) return s.name;
  }
  // More specific matches
  if (lower.includes("67") && lower.includes("layer")) return "67-Layer Damascus";
  if (lower.includes("vg10") || lower.includes("vg-10")) return "VG-10";
  if (lower.includes("aus-10") || lower.includes("aus10")) return "AUS-10";
  if (lower.includes("high carbon")) return "High Carbon Steel";
  if (lower.includes("carbon")) return "High Carbon Steel";
  if (lower.includes("stainless")) return "Stainless Steel";
  return null;
}

function matchKnife(productValue: string): string | null {
  const lower = productValue.toLowerCase();
  for (const k of KNIFE_TYPES) {
    if (lower.includes(k.name.toLowerCase())) return k.name;
  }
  return null;
}

/* ============================================================================
   Steel Comparison Modal
   ========================================================================= */

function SteelComparisonContent({ currentSteel }: { currentSteel: string }) {
  const matched = matchSteel(currentSteel);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-sans">
          Steel Guide
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-light mt-1 tracking-tight">
          Understanding Knife Steel
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg leading-relaxed">
          The steel determines how sharp your knife gets, how long it stays sharp, and how much care
          it needs. Here&apos;s how the main types compare.
        </p>
      </div>

      {/* Comparison Grid */}
      <div className="grid gap-3">
        {STEEL_TYPES.map((steel) => {
          const isCurrent = steel.name === matched;
          return (
            <div
              key={steel.name}
              className={cn(
                "relative rounded border p-4 sm:p-5 transition-colors",
                isCurrent
                  ? "border-primary/40 bg-primary/[0.03]"
                  : "border-border bg-card hover:border-border/80"
              )}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[10px] tracking-[0.15em] uppercase font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                  This knife
                </span>
              )}

              {/* Name + Japanese */}
              <div className="flex items-baseline gap-2 mb-3">
                <h3 className="font-serif text-lg font-medium">{steel.name}</h3>
                {steel.japanese && (
                  <span className="text-xs text-muted-foreground/50">{steel.japanese}</span>
                )}
                <span className="text-xs text-muted-foreground ml-auto mr-16 sm:mr-20 tabular-nums">
                  HRC {steel.hrc}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{steel.description}</p>

              {/* Rating bars */}
              <div className="grid sm:grid-cols-3 gap-2">
                <RatingBar label="Edge Retention" value={steelRating(steel.edgeRetention)} />
                <RatingBar label="Corrosion Resist." value={steelRating(steel.corrosionResistance)} />
                <RatingBar label="Easy to Sharpen" value={steelRating(steel.easeOfSharpening)} />
              </div>

              {/* Best for */}
              <p className="text-xs text-muted-foreground mt-3">
                <span className="text-foreground/70 font-medium">Best for:</span>{" "}
                {steel.bestFor}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   Knife Type Comparison Modal
   ========================================================================= */

function KnifeComparisonContent({ currentKnife }: { currentKnife: string }) {
  const matched = matchKnife(currentKnife);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-sans">
          Knife Guide
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl font-light mt-1 tracking-tight">
          Japanese Knife Styles
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg leading-relaxed">
          Each Japanese knife style is purpose-built for specific tasks.
          Understanding the differences helps you choose the right tool.
        </p>
      </div>

      {/* Comparison Grid */}
      <div className="grid gap-3">
        {KNIFE_TYPES.map((knife) => {
          const isCurrent = knife.name === matched;
          return (
            <div
              key={knife.name}
              className={cn(
                "relative rounded border p-4 sm:p-5 transition-colors",
                isCurrent
                  ? "border-primary/40 bg-primary/[0.03]"
                  : "border-border bg-card hover:border-border/80"
              )}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[10px] tracking-[0.15em] uppercase font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                  This knife
                </span>
              )}

              {/* Name + Japanese */}
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="font-serif text-lg font-medium">{knife.name}</h3>
                <span className="text-xs text-muted-foreground/50">{knife.japanese}</span>
              </div>

              {/* Quick stats row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-3">
                <span>{knife.profile}</span>
                <span className="text-border">|</span>
                <span>{knife.bladeLength}</span>
                <span className="text-border">|</span>
                <span>{knife.weight}</span>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{knife.description}</p>

              {/* Best for + Technique */}
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <p>
                  <span className="text-foreground/70 font-medium">Best for:</span>{" "}
                  <span className="text-muted-foreground">{knife.bestFor}</span>
                </p>
                <p>
                  <span className="text-foreground/70 font-medium">Technique:</span>{" "}
                  <span className="text-muted-foreground">{knife.technique}</span>
                </p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {knife.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] tracking-wide uppercase text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   Exported Controlled Dialogs
   ========================================================================= */

function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-200" />
        <Dialog.Popup className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="relative w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto bg-background border border-border sm:rounded-lg shadow-2xl rounded-t-xl sm:rounded-b-lg">
            <div className="sticky top-0 z-10 flex justify-end p-3 bg-background/80 backdrop-blur-sm border-b border-border/50">
              <Dialog.Close className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>
            <div className="px-5 sm:px-8 pb-8 pt-4">
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              <Dialog.Description className="sr-only">{description}</Dialog.Description>
              {children}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SteelComparisonDialog({
  open,
  onOpenChange,
  currentSteel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSteel: string;
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Steel Type Comparison Guide"
      description="Compare different knife steel types and their properties"
    >
      <SteelComparisonContent currentSteel={currentSteel} />
    </DialogShell>
  );
}

export function KnifeComparisonDialog({
  open,
  onOpenChange,
  currentKnife,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentKnife: string;
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Knife Type Comparison Guide"
      description="Compare different Japanese knife styles and their uses"
    >
      <KnifeComparisonContent currentKnife={currentKnife} />
    </DialogShell>
  );
}
