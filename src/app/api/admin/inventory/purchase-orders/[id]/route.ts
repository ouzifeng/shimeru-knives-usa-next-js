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
    notes?: string;
    lines?: Array<{ id: number; final_qty: number }>;
  };

  const { status, expected_arrival, notes, lines } = body;

  // Build PO header update
  const updates: Record<string, unknown> = {};
  if (status !== undefined) {
    updates.status = status;
    // Auto-set timestamps
    const now = new Date().toISOString();
    if (status === "sent") updates.sent_at = now;
    if (status === "shipped") updates.shipped_at = now;
    if (status === "arrived") updates.arrived_at = now;
  }
  if (expected_arrival !== undefined) updates.expected_arrival = expected_arrival;
  if (notes !== undefined) updates.notes = notes;

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
