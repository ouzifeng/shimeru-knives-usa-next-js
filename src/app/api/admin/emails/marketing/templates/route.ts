import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { MARKETING_TEMPLATES } from "@/lib/email-templates/marketing";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    templates: MARKETING_TEMPLATES.map((t) => {
      // Render once with placeholder args so the admin card can show the
      // real subject line without re-implementing it in metadata.
      let subject = "";
      try {
        subject = t.render({ recipientName: "there", campaignId: t.id }).subject;
      } catch {
        subject = "(render failed)";
      }
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        tagline: t.tagline ?? null,
        subject,
      };
    }),
  });
}
