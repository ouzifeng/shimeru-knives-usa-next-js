import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// AES-256-GCM encryption for sensitive PII (affiliate bank details).
// The key is derived from SUPABASE_SERVICE_ROLE_KEY so no new env var is needed.
// Encrypted at rest means a DB leak alone doesn't expose bank details — the key
// lives only in the server env.
//
// Caveat: rotating SUPABASE_SERVICE_ROLE_KEY would orphan previously-stored
// values (affiliates would just re-enter them). That key is stable in practice.

const SALT = "shimeru-affiliate-vault-v1";

function vaultKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing — cannot encrypt");
  return scryptSync(secret, SALT, 32);
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // base64(iv | tag | ciphertext)
  return Buffer.concat([iv, tag, data]).toString("base64");
}

export function decryptJson<T>(blob: string): T {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(out) as T;
}
