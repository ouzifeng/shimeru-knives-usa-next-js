import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getGoogleIpPrefixes } from "@/lib/google-ip";

export const revalidate = 86400;

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefixes = await getGoogleIpPrefixes();
  return NextResponse.json({ prefixes });
}
