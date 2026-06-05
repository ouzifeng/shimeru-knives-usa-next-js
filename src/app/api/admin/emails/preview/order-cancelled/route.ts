import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { renderOrderCancelled } from "@/lib/email-templates/order-cancelled";
import { buildOrderStatusFromLatestOrder } from "@/lib/email-templates/order-status-data";

function pageWithMessage(message: string) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:-apple-system,sans-serif;background:#f5f1e8;padding:48px;color:#2a2c34;">
       <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #dcd6cb;padding:32px;border-radius:4px;">
         <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:400;font-size:24px;">No preview available</h1>
         <p style="margin:0;color:#6d6a64;line-height:1.6;">${message}</p>
       </div>
     </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await buildOrderStatusFromLatestOrder("cancelled");
  if (!result.ok) {
    return pageWithMessage(result.reason);
  }

  const { html } = renderOrderCancelled(result.data);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
