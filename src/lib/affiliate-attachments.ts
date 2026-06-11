import { presignDownload } from "./r2";

export type AffiliateAttachment = {
  name: string;
  key: string;
  content_type: string;
  size: number;
  kind: "video" | "image" | "file";
};

// Enrich stored attachments (key only) with fresh short-lived signed view URLs.
export async function withSignedUrls(
  attachments: AffiliateAttachment[] | null | undefined
): Promise<(AffiliateAttachment & { url: string })[]> {
  const list = Array.isArray(attachments) ? attachments : [];
  return Promise.all(
    list.map(async (a) => ({ ...a, url: await presignDownload(a.key) }))
  );
}
