// Order confirmation email, sent the moment payment succeeds.
//
// Design notes:
//   - Email clients (especially Outlook) don't support oklch, custom fonts,
//     CSS grid, or flexbox reliably. Everything below is table-based with
//     inline styles, sRGB hex, and web-safe font stacks.
//   - Palette is converted from globals.css OKLCH values to sRGB hex:
//       terracotta primary -> #a25c43
//       washi paper bg     -> #f5f1e8
//       deep gray text     -> #2a2c34
//       warm stone border  -> #dcd6cb
//   - Headers use Georgia to approximate the site's serif font.

type Address = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
};

type OrderConfirmedItem = {
  name: string;
  quantity: number;
  total: string; // pre-formatted, e.g. "£49.99"
  imageUrl?: string; // absolute URL, required for email clients to load
};

export type OrderConfirmedData = {
  orderNumber: string;
  customerFirstName: string;
  dateLabel: string; // e.g. "29 May 2026"
  items: OrderConfirmedItem[];
  subtotal: string;
  shipping: string;
  discount?: string;
  tax?: string;
  total: string;
  shippingAddress: Address;
  shippingMethod?: string;
};

function whatHappensNext(_method: string | undefined): string {
  return "Your order is being prepared for dispatch. You'll get a tracking link the moment it's on its way.";
}

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

export function renderOrderConfirmed(d: OrderConfirmedData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Order confirmed, #${d.orderNumber}`;

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
            <td style="vertical-align:top;padding-right:12px;">
              <div style="font-family:${FONT_SANS};font-size:15px;color:${C.foreground};line-height:1.4;">${escapeHtml(item.name)}</div>
              <div style="margin-top:4px;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Qty ${item.quantity}</div>
            </td>
            <td align="right" style="vertical-align:top;font-family:${FONT_SANS};font-size:15px;color:${C.foreground};white-space:nowrap;">
              ${escapeHtml(item.total)}
            </td>
          </tr>
        </table>`
    )
    .join("");

  const discountRow = d.discount
    ? `<tr>
         <td style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Discount</td>
         <td align="right" style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.foreground};">−${escapeHtml(d.discount)}</td>
       </tr>`
    : "";

  const taxRow = d.tax
    ? `<tr>
         <td style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Tax</td>
         <td align="right" style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.foreground};">${escapeHtml(d.tax)}</td>
       </tr>`
    : "";

  const addr = d.shippingAddress;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT_SANS};color:${C.foreground};-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">
    Thanks ${escapeHtml(d.customerFirstName)}, your knife is on the way.
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
              <h1 style="margin:0;font-family:${FONT_SERIF};font-weight:400;font-size:34px;line-height:1.2;color:${C.foreground};">Order confirmed</h1>
              <p style="margin:18px 0 0;font-family:${FONT_SANS};font-size:16px;line-height:1.6;color:${C.muted};">
                Thank you, ${escapeHtml(d.customerFirstName)}. Your order is in and being prepared for dispatch.
              </p>
            </td>
          </tr>

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
                        <td align="right">
                          <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">Placed</div>
                          <div style="margin-top:5px;font-family:${FONT_SANS};font-size:14px;color:${C.foreground};">${escapeHtml(d.dateLabel)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:6px 28px 8px;">
                    ${itemsHtml}
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 28px 24px;border-top:1px solid ${C.hairline};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Subtotal</td>
                        <td align="right" style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.foreground};">${escapeHtml(d.subtotal)}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.muted};">Shipping</td>
                        <td align="right" style="padding:5px 0;font-family:${FONT_SANS};font-size:13px;color:${C.foreground};">${escapeHtml(d.shipping)}</td>
                      </tr>
                      ${discountRow}
                      ${taxRow}
                      <tr>
                        <td style="padding:14px 0 0;border-top:1px solid ${C.hairline};font-family:${FONT_SANS};font-size:15px;font-weight:600;color:${C.foreground};">Total</td>
                        <td align="right" style="padding:14px 0 0;border-top:1px solid ${C.hairline};font-family:${FONT_SANS};font-size:15px;font-weight:600;color:${C.foreground};">${escapeHtml(d.total)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 8px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top" style="padding-right:12px;">
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
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 8px 0;">
              <div style="font-family:${FONT_SANS};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${C.muted};">What happens next</div>
              <p style="margin:10px 0 0;font-family:${FONT_SANS};font-size:14px;line-height:1.7;color:${C.foreground};">
                ${escapeHtml(whatHappensNext(d.shippingMethod))}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:48px 8px 0;">
              <div style="height:1px;background:${C.border};margin-bottom:24px;"></div>
              <p style="margin:0;text-align:center;font-family:${FONT_SANS};font-size:12px;line-height:1.7;color:${C.muted};">
                Questions? Just reply to this email or write to <a href="mailto:sales@us.shimeruknives.co.uk" style="color:${C.primary};text-decoration:none;">sales@us.shimeruknives.co.uk</a>.
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

  const itemsText = d.items
    .map((i) => `  ${i.name} × ${i.quantity}    ${i.total}`)
    .join("\n");

  const text = `SHIMERU

Order confirmed
Thank you, ${d.customerFirstName}. Your order is in and being prepared for dispatch.

Order #${d.orderNumber}
Placed ${d.dateLabel}

${itemsText}

Subtotal:  ${d.subtotal}
Shipping:  ${d.shipping}${d.discount ? `\nDiscount:  -${d.discount}` : ""}${d.tax ? `\nTax:       ${d.tax}` : ""}
Total:     ${d.total}

Shipping to
${addr.name}
${addr.line1}
${addr.line2 ? `${addr.line2}\n` : ""}${addr.city} ${addr.postcode}
${addr.country}

What happens next
${whatHappensNext(d.shippingMethod)}

Questions? Reply to this email or write to sales@us.shimeruknives.co.uk

Shimeru Knives
`;

  return { subject, html, text };
}

