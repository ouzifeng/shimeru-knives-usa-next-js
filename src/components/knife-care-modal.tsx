"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

export function KnifeCareModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="text-left cursor-pointer group">
        <p className="text-sm font-medium group-hover:text-primary transition-colors">Knife Care</p>
        <p className="text-sm text-muted-foreground">Easy 3-step care</p>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-200" />
        <Dialog.Popup className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="relative w-full sm:max-w-lg max-h-[85vh] sm:max-h-[80vh] overflow-y-auto bg-background border border-border sm:rounded-lg shadow-2xl rounded-t-xl sm:rounded-b-lg">
            <div className="sticky top-0 z-10 flex justify-end p-3 bg-background/80 backdrop-blur-sm border-b border-border/50">
              <Dialog.Close className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>

            <div className="px-5 sm:px-8 pb-8 pt-4">
              <Dialog.Title className="sr-only">Knife Care Guide</Dialog.Title>
              <Dialog.Description className="sr-only">
                Simple 3-step knife care instructions
              </Dialog.Description>

              <img
                src="/knife-care.jpg"
                alt="Knife care guide — Rinse, Dry, Store"
                className="w-full rounded mb-6"
              />

              <div className="space-y-5">
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-1">
                    Step 1 — Rinse
                  </p>
                  <p className="text-sm leading-relaxed">
                    Warm water and mild soap after each use. Never put your knife in the dishwasher — the
                    harsh detergents and jostling will damage the edge and handle.
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-1">
                    Step 2 — Dry
                  </p>
                  <p className="text-sm leading-relaxed">
                    Towel dry immediately. Don&apos;t leave it wet or in the sink — even stainless steel
                    can develop spots if left damp.
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-1">
                    Step 3 — Store
                  </p>
                  <p className="text-sm leading-relaxed">
                    Use a knife block, magnetic strip, or blade guard. Never toss it loose in a drawer —
                    it dulls the edge and is a safety hazard.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-border">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  That&apos;s it — no special maintenance, no fussy rituals. Your Shimeru knife is designed
                  for daily use. With these three steps it&apos;ll stay razor-sharp for years.
                </p>
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
