"use client";

import { useState } from "react";
import type { ProductSpecs } from "@/lib/products";
import { SteelComparisonDialog, KnifeComparisonDialog } from "./specs-comparison-modal";
import { Ruler, Sword, Grip, ChefHat, UtensilsCrossed, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const SPEC_CONFIG: {
  key: keyof ProductSpecs;
  label: string;
  Icon: LucideIcon;
  interactive?: "steel" | "knife";
}[] = [
  { key: "blade_length", label: "Blade Length", Icon: Ruler },
  { key: "steel_type", label: "Steel Type", Icon: Sword, interactive: "steel" },
  { key: "handle_material", label: "Handle", Icon: Grip },
  { key: "knife_type", label: "Knife Type", Icon: ChefHat, interactive: "knife" },
  { key: "best_for", label: "Best For", Icon: UtensilsCrossed },
];

export function ProductSpecsGrid({ specs }: { specs: ProductSpecs }) {
  const [steelOpen, setSteelOpen] = useState(false);
  const [knifeOpen, setKnifeOpen] = useState(false);

  const validSpecs = SPEC_CONFIG.filter(({ key }) => specs[key] && specs[key] !== "Unknown");
  if (!validSpecs.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {validSpecs.map(({ key, label, Icon, interactive }) => {
          const isClickable = interactive === "steel" || interactive === "knife";

          return (
            <div
              key={key}
              className={isClickable ? "cursor-pointer hover:bg-muted/50 -m-1.5 p-1.5 rounded transition-colors" : ""}
              onClick={
                interactive === "steel"
                  ? () => setSteelOpen(true)
                  : interactive === "knife"
                    ? () => setKnifeOpen(true)
                    : undefined
              }
            >
              <div className="flex items-start gap-2.5 group">
                <Icon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={`text-base font-medium leading-snug ${isClickable ? "text-primary underline underline-offset-2 decoration-primary/30 group-hover:decoration-primary transition-colors" : ""}`}>
                    {specs[key]}
                    {isClickable && (
                      <span className="text-xs no-underline ml-1.5 text-muted-foreground font-normal tracking-wide">
                        Compare &rarr;
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <SteelComparisonDialog
        open={steelOpen}
        onOpenChange={setSteelOpen}
        currentSteel={specs.steel_type}
      />
      <KnifeComparisonDialog
        open={knifeOpen}
        onOpenChange={setKnifeOpen}
        currentKnife={specs.knife_type}
      />
    </>
  );
}
