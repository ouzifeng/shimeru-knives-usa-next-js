// Registry of marketing email templates.
//
// To add a new campaign:
//   1. Create a file in this folder that exports a render function:
//      (args: { recipientName?: string; campaignId: string }) => { subject, html, text }
//   2. Import it below and add an entry to MARKETING_TEMPLATES.
//   3. The Marketing tab in the admin auto-discovers anything registered here.
//
// All marketing sends go through Postmark's BROADCAST stream
// (MessageStream: "broadcast"), never the transactional stream.

export type MarketingRenderArgs = {
  recipientName?: string;
  /** Used to build UTM-tagged URLs inside the template so we can attribute
   *  purchases back to this specific campaign. */
  campaignId: string;
};

export type MarketingRendered = {
  subject: string;
  html: string;
  text: string;
};

export type MarketingTemplate = {
  id: string;
  name: string;
  description: string;
  /** Tagline shown in the admin card. */
  tagline?: string;
  render: (args: MarketingRenderArgs) => MarketingRendered;
};

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  // No marketing templates registered for the US site yet.
];

export function getMarketingTemplate(id: string): MarketingTemplate | undefined {
  return MARKETING_TEMPLATES.find((t) => t.id === id);
}

/** Build a UTM-tagged URL for use inside a marketing email body. */
export function utmLink(
  pathOrUrl: string,
  campaignId: string,
  content?: string
): string {
  const base = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `https://us.shimeruknives.co.uk${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const u = new URL(base);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "marketing");
  u.searchParams.set("utm_campaign", campaignId);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}
