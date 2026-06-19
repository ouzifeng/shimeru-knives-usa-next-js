// Partial refund email, sent when Stripe reports a partial refund on a charge
// (charge.refunded with amount_refunded < amount). The full-refund email is
// handled separately by the WC status sync; a partial refund never flips the
// WC status, so this email is fired straight from the Stripe webhook.
// Shares the visual language of order-confirmed.ts / order-refunded.ts.
// US store variant. House style: no em dashes.

import type { PartialRefundData } from "./order-status-data";

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

export function renderOrderPartiallyRefunded(d: PartialRefundData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Partial refund for order #${d.orderNumber}`;

  const itemsHtml = d.items
    .map(
      (item) => `
        <tr>
          <td style="padding:6px 0;font-family:${FONT_SANS};font-size:14px;color:${C.foreground};line-height:1.4;">${escapeHtml(item.name)}</td>
          <td align="right" style="padding:6px 0;font-family:${FONT_SANS};font-size:14px;color:${C.muted};white-space:nowrap;">Qty ${item.quantity}</td>
        </tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT_SANS};color:${C.foreground};-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">
    A partial refund of ${escapeHtml(d.refundedLabel)} for order #${escapeHtml(d.orderNumber)} is on its way.
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
            <td align="center" style="padding:0 24px 32px;">
              <h1 style="margin:0;font-family:${FONT_SERIF};font-weight:400;font-size:32px;line-height:1.2;color:${C.foreground};">Partial refund issued</h1>
              <p style="margin:18px 0 0;font-family:${FONT_SANS};font-size:16px;line-height:1.6;color:${C.muted};">
                Hi ${escapeHtml(d.customerFirstName)}, we've refunded <strong style="color:${C.foreground};">${escapeHtml(d.refundedLabel)}</strong> of order <strong style="color:${C.foreground};">#${escapeHtml(d.orderNumber)}</strong> back to your original payment method. Depending on your bank, it can take 5 to 10 business days to appear.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.card};border:1px solid ${C.border};border-radius:4px;">
                <tr>
                  <td style="padding:22px 28px 6px;">
                    <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">Order</div>
                    <div style="margin-top:5px;font-family:${FONT_SERIF};font-size:18px;color:${C.foreground};">#${escapeHtml(d.orderNumber)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 28px 8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${itemsHtml}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 28px 24px;border-top:1px solid ${C.hairline};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:4px 0;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Order total</td>
                        <td align="right" style="padding:4px 0;font-family:${FONT_SANS};font-size:13px;color:${C.foreground};">${escapeHtml(d.orderTotalLabel)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 0;border-top:1px solid ${C.hairline};font-family:${FONT_SANS};font-size:15px;font-weight:600;color:${C.foreground};">Amount refunded</td>
                        <td align="right" style="padding:8px 0 0;border-top:1px solid ${C.hairline};font-family:${FONT_SANS};font-size:15px;font-weight:600;color:${C.foreground};">${escapeHtml(d.refundedLabel)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 8px 0;">
              <div style="height:1px;background:${C.border};margin-bottom:24px;"></div>
              <p style="margin:0;text-align:center;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${C.muted};">
                Questions about your refund? Just reply or write to <a href="mailto:sales@us.shimeruknives.co.uk" style="color:${C.primary};text-decoration:none;">sales@us.shimeruknives.co.uk</a>.
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

  const itemsText = d.items.map((i) => `  ${i.name} x ${i.quantity}`).join("\n");

  const text = `SHIMERU

Partial refund issued
Hi ${d.customerFirstName}, we've refunded ${d.refundedLabel} of order #${d.orderNumber} back to your original payment method. Depending on your bank, it can take 5 to 10 business days to appear.

Order #${d.orderNumber}
${itemsText}

Order total:     ${d.orderTotalLabel}
Amount refunded: ${d.refundedLabel}

Questions about your refund? Reply to this email or write to sales@us.shimeruknives.co.uk

Shimeru Knives
`;

  return { subject, html, text };
}
