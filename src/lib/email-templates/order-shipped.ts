// Order shipped / dispatched email, sent when a WC order flips to "completed"
// (Shimeru's workflow: picking + adding tracking + marking complete = shipped).
//
// Shares the visual language of order-confirmed.ts: table-based, inline styles,
// sRGB hex (no oklch), web-safe fonts, Georgia for headers. Built for Outlook.
// (US store variant.)

type Address = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
};

type OrderShippedItem = {
  name: string;
  quantity: number;
  imageUrl?: string; // absolute URL, required for email clients to load
};

export type OrderShippedData = {
  orderNumber: string;
  customerFirstName: string;
  items: OrderShippedItem[];
  shippingAddress: Address;
  shippingMethod?: string; // e.g. "USPS Priority Mail"
  trackingNumber?: string;
  trackingUrl?: string;
  trackingProvider?: string; // display label, e.g. "USPS"
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
const FONT_MONO = "'SF Mono', 'Consolas', 'Liberation Mono', Menlo, monospace";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderOrderShipped(d: OrderShippedData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your order is on its way, #${d.orderNumber}`;

  const itemsHtml = d.items
    .map(
      (item) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
          <tr>
            ${
              item.imageUrl
                ? `<td width="72" style="vertical-align:top;padding-right:14px;width:72px;">
                    <img src="${escapeHtml(item.imageUrl)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border:1px solid ${C.border};border-radius:4px;background:${C.hairline};object-fit:cover;" />
                   </td>`
                : ""
            }
            <td style="vertical-align:top;">
              <div style="font-family:${FONT_SANS};font-size:15px;color:${C.foreground};line-height:1.4;">${escapeHtml(item.name)}</div>
              <div style="margin-top:4px;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Qty ${item.quantity}</div>
            </td>
          </tr>
        </table>`
    )
    .join("");

  const addr = d.shippingAddress;
  const providerLabel = d.trackingProvider || "your carrier";

  // Tracking card, the centrepiece. Falls back gracefully if no number/url.
  const trackingHtml = d.trackingNumber
    ? `
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.border};border-radius:4px;">
            <tr>
              <td style="padding:26px 28px;" align="center">
                <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">Tracking, ${escapeHtml(providerLabel)}</div>
                <div style="margin-top:10px;font-family:${FONT_MONO};font-size:20px;letter-spacing:0.04em;color:${C.foreground};">${escapeHtml(d.trackingNumber)}</div>
                ${
                  d.trackingUrl
                    ? `<div style="margin-top:20px;">
                         <a href="${escapeHtml(d.trackingUrl)}" style="display:inline-block;background:${C.foreground};color:${C.bg};text-decoration:none;font-family:${FONT_SANS};font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;padding:13px 30px;border-radius:2px;">Track your parcel</a>
                       </div>`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>`
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
    Good news ${escapeHtml(d.customerFirstName)}, your knife has been dispatched.
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <tr>
            <td align="center" style="padding:8px 0 48px;">
              <a href="https://us.shimeruknives.co.uk" style="text-decoration:none;">
                <img src="https://us.shimeruknives.co.uk/logo.png" width="160" alt="Shimeru Knives" style="display:block;width:160px;max-width:160px;height:auto;border:0;" />
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 24px 36px;">
              <h1 style="margin:0;font-family:${FONT_SERIF};font-weight:400;font-size:34px;line-height:1.2;color:${C.foreground};">On its way</h1>
              <p style="margin:18px 0 0;font-family:${FONT_SANS};font-size:16px;line-height:1.6;color:${C.muted};">
                Good news, ${escapeHtml(d.customerFirstName)}. Your order has left our warehouse and is heading to you.
              </p>
            </td>
          </tr>

          ${trackingHtml}

          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.border};border-radius:4px;">

                <tr>
                  <td style="padding:24px 28px 18px;border-bottom:1px solid ${C.hairline};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">Order</div>
                          <div style="margin-top:5px;font-family:${FONT_SERIF};font-size:18px;color:${C.foreground};">#${escapeHtml(d.orderNumber)}</div>
                        </td>
                        ${
                          d.shippingMethod
                            ? `<td align="right">
                                 <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">Method</div>
                                 <div style="margin-top:5px;font-family:${FONT_SANS};font-size:14px;color:${C.foreground};">${escapeHtml(d.shippingMethod)}</div>
                               </td>`
                            : ""
                        }
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:6px 28px 18px;">
                    ${itemsHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 8px 0;">
              <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">Shipping to</div>
              <div style="margin-top:10px;font-family:${FONT_SANS};font-size:14px;line-height:1.6;color:${C.foreground};">
                ${escapeHtml(addr.name)}<br>
                ${escapeHtml(addr.line1)}<br>
                ${addr.line2 ? `${escapeHtml(addr.line2)}<br>` : ""}
                ${escapeHtml(addr.city)} ${escapeHtml(addr.postcode)}<br>
                ${escapeHtml(addr.country)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:48px 8px 0;">
              <div style="height:1px;background:${C.border};margin-bottom:24px;"></div>
              <p style="margin:0;text-align:center;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${C.muted};">
                Changed your mind? You have 60 days to return any unused, undamaged knife. Questions? Just reply or write to <a href="mailto:sales@us.shimeruknives.co.uk" style="color:${C.primary};text-decoration:none;">sales@us.shimeruknives.co.uk</a>.
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

  const itemsText = d.items.map((i) => `  ${i.name} × ${i.quantity}`).join("\n");

  const text = `SHIMERU

On its way
Good news, ${d.customerFirstName}. Your order has left our warehouse and is heading to you.

Order #${d.orderNumber}${d.shippingMethod ? `\n${d.shippingMethod}` : ""}
${
  d.trackingNumber
    ? `\nTracking (${providerLabel}): ${d.trackingNumber}${d.trackingUrl ? `\nTrack: ${d.trackingUrl}` : ""}\n`
    : ""
}
${itemsText}

Shipping to
${addr.name}
${addr.line1}
${addr.line2 ? `${addr.line2}\n` : ""}${addr.city} ${addr.postcode}
${addr.country}

Changed your mind? You have 60 days to return any unused, undamaged knife.
Questions? Reply to this email or write to sales@us.shimeruknives.co.uk

Shimeru Knives
`;

  return { subject, html, text };
}
