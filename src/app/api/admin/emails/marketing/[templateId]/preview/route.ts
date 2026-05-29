import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getMarketingTemplate } from "@/lib/email-templates/marketing";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ templateId: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { templateId } = await ctx.params;
  const template = getMarketingTemplate(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  const { html } = template.render({ recipientName: "David", campaignId: templateId });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
