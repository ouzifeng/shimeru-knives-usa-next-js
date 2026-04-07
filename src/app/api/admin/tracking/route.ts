import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const TRACKING_KEYS = [
  "ga4_measurement_id",
  "ga4_api_secret",
  "google_ads_conversion_id",
  "google_ads_conversion_label",
];

export async function GET() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("settings")
    .select("key, value")
    .in("key", TRACKING_KEYS);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: Record<string, string> = {};
  data?.forEach((row) => {
    settings[row.key] = row.value;
  });

  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  try {
    const { settings } = await request.json();

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Settings object required" },
        { status: 400 }
      );
    }

    // Only allow known tracking keys
    const filtered = Object.entries(settings).filter(([key]) =>
      TRACKING_KEYS.includes(key)
    );

    if (!filtered.length) {
      return NextResponse.json(
        { error: "No valid tracking keys provided" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const rows = filtered.map(([key, value]) => ({
      key,
      value: String(value),
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
