import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("purchase_orders")
    .select("*, purchase_order_lines(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabaseAdmin();

  const body = await req.json() as {
    status?: string;
    expected_arrival?: string;
    shipped_date?: string;
    tracking_carrier?: string;
    tracking_number?: string;
    tracking_url?: string;
    notes?: string;
    lines?: Array<{ id: number; final_qty: number }>;
  };

  const {
    status,
    expected_arrival,
    shipped_date,
    tracking_carrier,
    tracking_number,
    tracking_url,
    notes,
    lines,
  } = body;

  // Build PO header update
  const updates: Record<string, unknown> = {};
  if (status !== undefined) {
    updates.status = status;
    // Auto-set timestamps
    const now = new Date().toISOString();
    if (status === "created") updates.finalised_at = now;
    if (status === "shipped") updates.shipped_at = now;
    if (status === "arrived") updates.arrived_at = now;
  }
  if (shipped_date !== undefined) updates.shipped_date = shipped_date;
  if (tracking_carrier !== undefined) updates.tracking_carrier = tracking_carrier;
  if (tracking_number !== undefined) updates.tracking_number = tracking_number;
  if (tracking_url !== undefined) updates.tracking_url = tracking_url;
  if (expected_arrival !== undefined) updates.expected_arrival = expected_arrival;
  if (notes !== undefined) updates.notes = notes;

  // Auto-calc expected_arrival = shipped_date + 30 days when shipping (unless caller overrode it)
  if (status === "shipped" && shipped_date && expected_arrival === undefined) {
    const eta = new Date(shipped_date);
    eta.setUTCDate(eta.getUTCDate() + 30);
    updates.expected_arrival = eta.toISOString();
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await sb
      .from("purchase_orders")
      .update(updates)
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  // Update individual line quantities if provided
  if (lines && lines.length > 0) {
    for (const line of lines) {
      const { error: lineErr } = await sb
        .from("purchase_order_lines")
        .update({ final_qty: line.final_qty })
        .eq("id", line.id)
        .eq("po_id", id);

      if (lineErr) {
        return NextResponse.json({ error: lineErr.message }, { status: 500 });
      }
    }
  }

  // Return updated PO with lines
  const { data, error } = await sb
    .from("purchase_orders")
    .select("*, purchase_order_lines(*)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
