import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

// These end up in the page source of every visitor anyway, so serving them
// publicly costs nothing.
const PUBLIC_KEYS = [
  "ga4_measurement_id",
  "google_ads_conversion_id",
  "google_ads_conversion_label",
];

// The Measurement Protocol secret authorises writes to our GA4 property, so it
// is never served to the storefront. Anyone holding it could inject fake
// purchases and poison the data Smart Bidding learns from.
const ADMIN_ONLY_KEYS = ["ga4_api_secret"];

const TRACKING_KEYS = [...PUBLIC_KEYS, ...ADMIN_ONLY_KEYS];

export async function GET() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("settings")
    .select("key, value")
    .in("key", TRACKING_KEYS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all: Record<string, string> = {};
  data?.forEach((row) => {
    all[row.key] = row.value;
  });

  // The Analytics component calls this on every page load, so only a signed-in
  // admin gets the secret back.
  const authed = await isAdmin();
  const settings: Record<string, string> = {};
  for (const key of PUBLIC_KEYS) {
    if (all[key] !== undefined) settings[key] = all[key];
  }
  if (authed) {
    for (const key of ADMIN_ONLY_KEYS) {
      if (all[key] !== undefined) settings[key] = all[key];
    }
  }

  // Lets the admin UI show whether a secret exists without revealing it.
  const res = NextResponse.json({
    settings,
    ga4_api_secret_set: Boolean(all.ga4_api_secret),
  });
  // The storefront (unauthenticated) calls this on every page load for public
  // GA/Ads ids that change ~never, so let the edge cache the public response.
  // The authed response can carry the secret, so it is never cached; Vary on
  // Cookie keeps a public cache entry from ever being served to an admin request.
  if (authed) {
    res.headers.set("Cache-Control", "private, no-store");
  } else {
    res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=60");
  }
  res.headers.set("Vary", "Cookie");
  return res;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { settings } = await request.json();

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Settings object required" },
        { status: 400 }
      );
    }

    const filtered = Object.entries(settings)
      .filter(([key]) => TRACKING_KEYS.includes(key))
      // A blank field means "not supplied", never "erase". Without this, an
      // admin tab that loaded before a change writes its stale state back on
      // save and silently reverts live config.
      .filter(([, value]) => value != null && String(value).trim() !== "");

    if (!filtered.length) {
      return NextResponse.json(
        { error: "No valid tracking keys provided" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const rows = filtered.map(([key, value]) => ({
      key,
      // Trimmed on the way in. A trailing space on the conversion label is
      // invisible in the UI and produces a malformed send_to target.
      value: String(value).trim(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await admin
      .from("settings")
      .upsert(rows, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save tracking settings",
      },
      { status: 500 }
    );
  }
}
