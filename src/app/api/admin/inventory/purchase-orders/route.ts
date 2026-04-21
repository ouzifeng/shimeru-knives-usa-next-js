import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabaseAdmin();

  // Fetch all POs with aggregated total units from lines
  const { data: pos, error: posErr } = await sb
    .from("purchase_orders")
    .select("*, purchase_order_lines(final_qty)")
    .order("created_at", { ascending: false });

  if (posErr) {
    return NextResponse.json({ error: posErr.message }, { status: 500 });
  }

  // Aggregate total final_qty per PO
  const result = (pos ?? []).map((po) => {
    const lines: { final_qty: number | null }[] = po.purchase_order_lines ?? [];
    const totalUnits = lines.reduce((sum, l) => sum + (l.final_qty ?? 0), 0);
    const { purchase_order_lines: _lines, ...poData } = po;
    return { ...poData, totalUnits };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin();

  const body = await req.json() as {
    reference: string;
    status?: string;
    notes?: string;
    expected_arrival?: string;
    lines?: Array<{ sku: string; product_name: string; qty: number }>;
  };

  const { reference, status = "draft", notes, expected_arrival, lines } = body;

  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  // Insert PO header
  const { data: poRow, error: poErr } = await sb
    .from("purchase_orders")
    .insert({ reference, status, notes, expected_arrival })
    .select("*")
    .single();

  if (poErr) {
    return NextResponse.json({ error: poErr.message }, { status: 500 });
  }

  // Insert lines if provided
  if (lines && lines.length > 0) {
    const lineRows = lines.map((l) => ({
      po_id: poRow.id,
      sku: l.sku,
      product_name: l.product_name,
      recommended_qty: l.qty,
      final_qty: l.qty,
    }));

    const { error: lineErr } = await sb.from("purchase_order_lines").insert(lineRows);
    if (lineErr) {
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(poRow, { status: 201 });
}
