import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, anonKey, serviceRoleKey } = body;

    if (!url || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create a temporary client with the provided credentials
    const supabase = createClient(url, serviceRoleKey);

    // Try to query the products table to check if schema exists
    const { error } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    if (error) {
      // If the error is about the table not existing, the connection works but schema is missing
      if (error.message.includes("does not exist") || error.message.includes("Could not find") || error.code === "42P01") {
        return NextResponse.json({ ok: true, hasSchema: false });
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, hasSchema: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 200 }
    );
  }
}
