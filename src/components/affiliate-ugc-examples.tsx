"use client";

// Example UGC shown on the affiliate apply page so applicants see the kind of
// content we love. PLACEHOLDER POSTS: these are external (competitor) Instagram
// posts used only to design the layout. Replace with our own / approved creator
// clips before this page goes live.
//
// Embedding uses Instagram's public no-auth iframe endpoint
// (https://www.instagram.com/p/{shortcode}/embed), no API token required.
// To change the examples, edit POST_SHORTCODES below.

const POST_SHORTCODES = [
  "DZMmRPrgHrJ",
  "DZMmRSwAIoX",
  "DZMmRaagHdY",
  "DZMmpO5AAY5",
  "DZMmRPaADbt",
  "DZMmRYvgFbL",
  "DYRwTpeAH3o",
];

export function AffiliateUgcExamples() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {POST_SHORTCODES.map((code) => (
        <div
          key={code}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <iframe
            src={`https://www.instagram.com/p/${code}/embed`}
            title={`Instagram post ${code}`}
            loading="lazy"
            scrolling="no"
            allowTransparency
            className="w-full h-[560px] border-0"
          />
        </div>
      ))}
    </div>
  );
}
