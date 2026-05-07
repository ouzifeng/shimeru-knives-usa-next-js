import { cookies } from "next/headers";
import { createHmac } from "crypto";

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) return false;
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", secret).update(nonce).digest("hex");
  return sig === expected;
}
