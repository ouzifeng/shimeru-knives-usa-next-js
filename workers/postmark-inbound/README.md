# postmark-inbound-us

US counterpart of the UK inbound proxy. Same Worker code, pointed at the US
Next.js route.

**Full explanation, deploy steps, cutover procedure and rollback are in
`uk/workers/postmark-inbound/README.md`.** Only the details below differ.

| | |
|---|---|
| Worker | `postmark-inbound-us.ouzifeng.workers.dev` |
| Forwards to | `https://us.shimeruknives.co.uk/api/webhooks/postmark/inbound` |
| Postmark server | `shimeru-knives-us-next` |
| Cloudflare account | `903198f95cb0b7481c8cd608cf56ba59` (pinned in wrangler.jsonc) |
| R2 bucket | `affiliate-content` (shared with UK, keys are namespaced by message id) |

Deployed and cut over 29 July 2026. Secrets `HOOK_PATH_SECRET` and
`PROXY_SECRET` are set on the Worker; `INBOUND_PROXY_SECRET` is set in Vercel
production and enforced.

## Why this was needed here too

The US route had the identical fault: Postmark inlines attachments as base64
and Vercel rejects request bodies over 4.5MB. It had never fired because the US
Postmark server has no inbound history, so no US customer was affected. It
would have broken the first time anyone emailed a photo.

## Verified 29 July 2026

```
forged POST without secret          -> HTTP 403
18.67 MB payload through the Worker -> HTTP 200, ticket created
3 attachments, bytes sha256-verified after round trip
R2 staging cleaned up, test ticket removed
15 passed, 0 failed
```
