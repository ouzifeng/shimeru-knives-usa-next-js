"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getDeliveryWindow } from "@/lib/delivery";
import {
  DELIVERY_STATES,
  DELIVERY_STATE_KEY,
  LOWER_48_RANGE,
  getBandForState,
} from "@/content/delivery-estimates";

// A tiny external store over localStorage. useSyncExternalStore rather than
// useState + useEffect, because it keeps hydration safe (the server snapshot is
// always empty, so no date is ever server-rendered) and keeps every instance of
// this component on the page in sync with one another.
let listeners: Array<() => void> = [];
let cached: string | null = null;

function readStored(): string {
  if (cached === null) {
    try {
      cached = window.localStorage.getItem(DELIVERY_STATE_KEY) || "";
    } catch {
      // localStorage blocked (private mode)
      cached = "";
    }
    // Guard against a stale or hand-edited value
    if (cached && !DELIVERY_STATES.some((s) => s.code === cached)) cached = "";
  }
  return cached;
}

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function writeStored(code: string) {
  cached = code;
  try {
    if (code) window.localStorage.setItem(DELIVERY_STATE_KEY, code);
    else window.localStorage.removeItem(DELIVERY_STATE_KEY);
  } catch {
    // Selection still applies to this page view, it just will not persist
  }
  for (const listener of listeners) listener();
}

interface Props {
  /** Prefix the estimate with "Free shipping ·". Used on the PDP, where the
   *  estimate doubles as the free-delivery trust signal. */
  showFreeShipping?: boolean;
}

export function DeliveryEstimate({ showFreeShipping = false }: Props) {
  const stateCode = useSyncExternalStore(subscribe, readStored, () => "");

  const range = useMemo(() => {
    const band = stateCode ? getBandForState(stateCode) : null;
    return band ? getDeliveryWindow(band.minDays, band.maxDays) : null;
  }, [stateCode]);

  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <div>
        {showFreeShipping && (
          <>
            <span className="text-foreground font-medium">Free shipping</span>
            <span className="mx-1.5">·</span>
          </>
        )}
        {range ? (
          range.sameDay ? (
            <>Estimated arrival {range.from}</>
          ) : (
            <>
              Estimated arrival {range.from} – {range.to}
            </>
          )
        ) : (
          <>Estimated arrival in {LOWER_48_RANGE}</>
        )}
      </div>

      <select
        value={stateCode}
        onChange={(e) => writeStored(e.target.value)}
        aria-label="Select your state for a delivery estimate"
        className="border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      >
        <option value="">Select your state for a closer estimate</option>
        {DELIVERY_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
