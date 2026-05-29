import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { resolveSegmentRecipients } from "@/lib/marketing-recipients";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve all four segments in parallel and return counts
  const [all, vip, repeat, fresh, abandoned] = await Promise.all([
    resolveSegmentRecipients("all"),
    resolveSegmentRecipients("vip"),
    resolveSegmentRecipients("repeat"),
    resolveSegmentRecipients("new"),
    resolveSegmentRecipients("abandoned-only"),
  ]);

  return NextResponse.json({
    all: all.length,
    vip: vip.length,
    repeat: repeat.length,
    new: fresh.length,
    "abandoned-only": abandoned.length,
  });
}
