/**
 * Postmark inbound proxy.
 *
 * Why this exists
 * ---------------
 * Postmark POSTs inbound email to a webhook with every attachment base64
 * encoded inline. Vercel serverless functions reject request bodies over
 * 4.5MB, so any customer emailing a few phone photos got an HTTP 413 and the
 * ticket was never created. Postmark recorded these as Status: Failed with
 * "Inbound hook received HTTP 413". Five messages from one customer were lost
 * this way between 13 and 28 July 2026, including the photos we had explicitly
 * asked her for.
 *
 * Workers accept request bodies up to 100MB, so this sits in front of the
 * Next.js route: it strips the attachment bytes out into R2 and forwards a
 * slim JSON payload that comfortably fits inside Vercel's limit. The Next.js
 * route still does all the ticket/threading logic.
 *
 * Contract with the Next.js route
 * -------------------------------
 * Each entry in Attachments loses `Content` and gains `Key` (an R2 object key)
 * plus `Bucket`. The route treats `Key` as the signal to pull bytes from R2
 * instead of decoding base64. Payloads without `Key` still work unchanged, so
 * the route can be deployed before this Worker is live.
 *
 * Object keys are deterministic (message id + index + name), so a Postmark
 * retry overwrites rather than duplicates.
 */

const JSON_HEADERS = { "content-type": "application/json" };

/** Attachments larger than this are skipped rather than risking the memory cap. */
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

/**
 * Decodes base64 to bytes. Prefers the native implementation where the runtime
 * has it (much cheaper on CPU for multi-megabyte photos), falls back to atob.
 * Postmark occasionally wraps base64 across lines, which atob rejects, so we
 * only pay for whitespace stripping when the direct decode fails.
 */
function b64ToBytes(b64) {
  if (typeof Uint8Array.fromBase64 === "function") {
    try {
      return Uint8Array.fromBase64(b64);
    } catch {
      return Uint8Array.fromBase64(b64.replace(/\s/g, ""));
    }
  }
  let binary;
  try {
    binary = atob(b64);
  } catch {
    binary = atob(b64.replace(/\s/g, ""));
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // The hook URL carries a secret path segment. Postmark is configured with
    // the full URL, so no extra auth config is needed on their side. Anything
    // hitting the bare hostname is a scanner and gets nothing.
    if (env.HOOK_PATH_SECRET) {
      const { pathname } = new URL(request.url);
      if (pathname.replace(/^\/+/, "") !== env.HOOK_PATH_SECRET) {
        return new Response("Not found", { status: 404 });
      }
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const messageId = sanitizeFilename(payload.MessageID || "no-id");
    const attachments = Array.isArray(payload.Attachments) ? payload.Attachments : [];
    const staged = [];

    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i];
      if (!a || typeof a.Content !== "string" || a.Content.length === 0) {
        // Already staged, or genuinely empty. Pass through untouched.
        staged.push(a);
        continue;
      }

      const safeName = sanitizeFilename(a.Name);
      const key = `inbound/${messageId}/${i}-${safeName}`;
      const contentType = a.ContentType || "application/octet-stream";

      try {
        const bytes = b64ToBytes(a.Content);

        if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
          console.error(
            `[inbound-proxy] skipping oversized attachment ${safeName} (${bytes.byteLength} bytes)`
          );
          staged.push({
            Name: a.Name,
            ContentType: contentType,
            ContentLength: bytes.byteLength,
            ContentID: a.ContentID,
            Skipped: "too-large",
          });
          continue;
        }

        await env.ATTACHMENTS.put(key, bytes, {
          httpMetadata: { contentType },
        });

        staged.push({
          Name: a.Name,
          ContentType: contentType,
          ContentLength: bytes.byteLength,
          ContentID: a.ContentID,
          Key: key,
          Bucket: env.BUCKET_NAME || "affiliate-content",
        });
      } catch (err) {
        // One bad attachment must not cost us the whole email. The ticket is
        // worth more than the photo, and Postmark would otherwise retry forever.
        console.error(`[inbound-proxy] failed to stage ${safeName}:`, err);
        staged.push({
          Name: a.Name,
          ContentType: contentType,
          ContentLength: a.ContentLength,
          ContentID: a.ContentID,
          Skipped: "stage-failed",
        });
      } finally {
        // Release the base64 string as soon as we are done with it. Sarah's
        // three photos are ~26MB of base64, which is ~52MB held as a JS string.
        a.Content = undefined;
      }
    }

    payload.Attachments = staged;

    const headers = { ...JSON_HEADERS };
    if (env.PROXY_SECRET) headers["x-inbound-proxy-secret"] = env.PROXY_SECRET;

    let upstream;
    try {
      upstream = await fetch(env.FORWARD_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[inbound-proxy] forward failed:", err);
      // 5xx so Postmark retries. Staged objects use deterministic keys, so the
      // retry overwrites them rather than piling up duplicates.
      return new Response(JSON.stringify({ error: "Upstream unreachable" }), {
        status: 502,
        headers: JSON_HEADERS,
      });
    }

    const bodyText = await upstream.text();
    if (!upstream.ok) {
      console.error(`[inbound-proxy] upstream ${upstream.status}: ${bodyText.slice(0, 500)}`);
    }

    // Mirror the upstream status so Postmark's own retry logic still governs.
    return new Response(bodyText, {
      status: upstream.status,
      headers: JSON_HEADERS,
    });
  },
};
