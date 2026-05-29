import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { resolveSegmentRecipients, type Segment } from "@/lib/marketing-recipients";

const SAMPLE_SIZE = 10;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const segments: Segment[] = ["all", "vip", "repeat", "new", "abandoned-only"];

  const results = await Promise.all(
    segments.map(async (seg) => {
      const recipients = await resolveSegmentRecipients(seg);
      return [
        seg,
        {
          count: recipients.length,
          sample: recipients
            .slice(0, SAMPLE_SIZE)
            .map((r) => ({ email: r.email, name: r.name })),
        },
      ] as const;
    })
  );

  const out: Record<string, { count: number; sample: Array<{ email: string; name: string | null }> }> = {};
  for (const [seg, data] of results) out[seg] = data;
  return NextResponse.json(out);
}
