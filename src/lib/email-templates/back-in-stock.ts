// Back-in-stock email — sent when a product a customer asked about returns to
// stock. Shares the visual language of order-confirmed.ts / order-shipped.ts:
// table-based, inline styles, sRGB hex (no oklch), web-safe fonts, Georgia for
// headers. Built for Outlook. (US store variant.)

export type BackInStockData = {
  productName: string;
  productUrl: string; // absolute, already carries tracking/UTM params
  imageUrl?: string; // absolute URL — required for email clients to load
  priceLabel?: string; // formatted current price, e.g. "$89.00"
  regularPriceLabel?: string; // formatted RRP for the strikethrough, when on sale
  savePercent?: number; // e.g. 20 — shown as "Save 20%" when on sale
};

const C = {
  bg: "#f5f1e8",
  card: "#ffffff",
  foreground: "#2a2c34",
  muted: "#6d6a64",
  border: "#dcd6cb",
  hairline: "#e7e1d6",
  primary: "#a25c43",
};

const FONT_SERIF = "Georgia, 'Times New Roman', serif";
const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBackInStock(d: BackInStockData): {
  subject: string;
  html: string;
  text: string;
} {
  const name = escapeHtml(d.productName);
  const subject = `Back in stock: ${d.productName}`;
  const onSale = Boolean(d.regularPriceLabel && d.priceLabel);

  const priceHtml = d.priceLabel
    ? `<div style="margin-top:14px;font-family:${FONT_SANS};font-size:18px;color:${C.foreground};">
         ${
           onSale
             ? `<span style="text-decoration:line-through;color:${C.muted};font-size:15px;margin-right:8px;">${escapeHtml(
                 d.regularPriceLabel!
               )}</span>`
             : ""
         }<span style="font-weight:600;">${escapeHtml(d.priceLabel)}</span>${
           onSale && d.savePercent
             ? `<span style="margin-left:10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${C.primary};font-weight:600;">Save ${d.savePercent}%</span>`
             : ""
         }
       </div>`
    : "";

  const imageHtml = d.imageUrl
    ? `<tr>
         <td align="center" style="padding:0 28px 4px;">
           <a href="${escapeHtml(d.productUrl)}" style="text-decoration:none;">
             <img src="${escapeHtml(
               d.imageUrl
             )}" width="320" alt="${name}" style="display:block;width:100%;max-width:320px;height:auto;border:1px solid ${C.border};border-radius:4px;background:${C.hairline};" />
           </a>
         </td>
       </tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT_SANS};color:${C.foreground};-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">
    ${name} is back — and you asked us to let you know.
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <tr>
            <td align="center" style="padding:8px 0 44px;">
              <a href="https://us.shimeruknives.co.uk" style="text-decoration:none;">
                <img src="https://us.shimeruknives.co.uk/logo.png" width="160" alt="Shimeru Knives" style="display:block;width:160px;max-width:160px;height:auto;border:0;" />
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 24px 28px;">
              <div style="font-family:${FONT_SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${C.primary};">Back in stock</div>
              <h1 style="margin:14px 0 0;font-family:${FONT_SERIF};font-weight:400;font-size:32px;line-height:1.2;color:${C.foreground};">It's back</h1>
              <p style="margin:16px 0 0;font-family:${FONT_SANS};font-size:16px;line-height:1.6;color:${C.muted};">
                You asked us to let you know when this came back &mdash; here it is. Stock is limited, so don't wait too long.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.border};border-radius:4px;">
                ${imageHtml}
                <tr>
                  <td align="center" style="padding:22px 28px 30px;">
                    <div style="font-family:${FONT_SERIF};font-size:22px;line-height:1.3;color:${C.foreground};">${name}</div>
                    ${priceHtml}
                    <div style="margin-top:24px;">
                      <a href="${escapeHtml(
                        d.productUrl
                      )}" style="display:inline-block;background:${C.foreground};color:${C.bg};text-decoration:none;font-family:${FONT_SANS};font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;padding:14px 34px;border-radius:2px;">Shop now</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:44px 8px 0;">
              <div style="height:1px;background:${C.border};margin-bottom:24px;"></div>
              <p style="margin:0;text-align:center;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${C.muted};">
                You're getting this because you signed up for a back-in-stock alert at Shimeru Knives. Questions? Just reply or write to <a href="mailto:sales@us.shimeruknives.co.uk" style="color:${C.primary};text-decoration:none;">sales@us.shimeruknives.co.uk</a>.
              </p>
              <p style="margin:14px 0 0;text-align:center;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${C.muted};">
                Shimeru Knives
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const priceText = d.priceLabel
    ? `\n${onSale ? `${d.regularPriceLabel} ` : ""}${d.priceLabel}${
        onSale && d.savePercent ? ` (save ${d.savePercent}%)` : ""
      }`
    : "";

  const text = `SHIMERU

BACK IN STOCK

It's back
You asked us to let you know when this came back — here it is. Stock is limited, so don't wait too long.

${d.productName}${priceText}

Shop now: ${d.productUrl}

You're getting this because you signed up for a back-in-stock alert at Shimeru Knives.
Questions? Reply to this email or write to sales@us.shimeruknives.co.uk

Shimeru Knives
`;

  return { subject, html, text };
}
