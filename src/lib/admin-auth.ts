import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) return false;
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", secret).update(nonce).digest("hex");
  // Constant-time compare so a timing side channel can't be used to forge a sig.
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}
