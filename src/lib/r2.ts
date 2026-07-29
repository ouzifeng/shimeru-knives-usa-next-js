// Cloudflare R2 (S3-compatible) helper for affiliate content uploads.
//
// Large files are uploaded direct from the browser to R2 via a presigned PUT
// URL, so they never touch Vercel (4.5MB body limit) or Supabase (50MB cap).
// We only ever store the object key; viewing URLs are presigned on demand and
// short-lived, so the bucket stays private.
//
// Non-secret config is hardcoded. Credentials come from env only:
//   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = "903198f95cb0b7481c8cd608cf56ba59";
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// The bucket you created in the Cloudflare dashboard. Change here if you named
// it something other than "affiliate-content".
export const R2_BUCKET = "affiliate-content";

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 credentials missing — set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY"
      );
    }
    _client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

export function r2Configured(): boolean {
  return !!process.env.R2_ACCESS_KEY_ID && !!process.env.R2_SECRET_ACCESS_KEY;
}

/** Presigned PUT URL for a direct browser upload. */
export async function presignUpload(
  key: string,
  contentType: string,
  ttlSeconds = 600
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
}

/** Server-side upload of bytes we already hold (e.g. inbound email attachments). */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await client().send(cmd);
}

/** Presigned GET URL for viewing/downloading a stored object. */
export async function presignDownload(key: string, ttlSeconds = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
}

/**
 * Reads a stored object back into memory. Used to drain attachments that the
 * inbound proxy Worker staged in R2, so they can be moved into their final
 * home. Server-side fetches have no size cap (unlike the 4.5MB Vercel request
 * body limit that made the proxy necessary in the first place).
 */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  const res = await client().send(cmd);
  if (!res.Body) throw new Error(`R2 object has no body: ${key}`);
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Removes a staged object once it has been moved to its final home. */
export async function deleteObject(key: string): Promise<void> {
  const cmd = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key });
  await client().send(cmd);
}

export function kindFromContentType(contentType: string): "video" | "image" | "file" {
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  return "file";
}
