import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "supabase", "migrations", "001_initial_schema.sql");
    const sql = await readFile(filePath, "utf-8");
    return NextResponse.json({ sql });
  } catch (err) {
    return NextResponse.json(
      { sql: "", error: err instanceof Error ? err.message : "Could not read migration file" },
      { status: 500 }
    );
  }
}
