/**
 * Server-side GA4 Measurement Protocol tracking.
 * Used from webhooks/server actions as a reliable backup when client-side
 * tracking is blocked (e.g. Apple ITP, ad blockers).
 */

interface MeasurementProtocolItem {
  item_id: string;
  item_name: string;
  quantity: number;
  price: number;
}

interface ServerPurchaseEventParams {
  measurement_id: string;
  api_secret: string;
  client_id: string;
  transaction_id: string;
  value: number;
  currency: string;
  items: MeasurementProtocolItem[];
  gclid?: string;
}

/**
 * Fire a purchase event via the GA4 Measurement Protocol.
 * This sends the event directly to Google Analytics servers,
 * bypassing the browser entirely.
 *
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export async function fireServerPurchaseEvent(
  params: ServerPurchaseEventParams
): Promise<void> {
  const {
    measurement_id,
    api_secret,
    client_id,
    transaction_id,
    value,
    currency,
    items,
    gclid,
  } = params;

  if (!measurement_id || !api_secret) {
    console.warn(
      "[tracking-server] Missing GA4 measurement_id or api_secret, skipping server-side purchase event"
    );
    return;
  }

  const url = new URL("https://www.google-analytics.com/mp/collect");
  url.searchParams.set("measurement_id", measurement_id);
  url.searchParams.set("api_secret", api_secret);

  const payload: Record<string, unknown> = {
    client_id,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id,
          value,
          currency,
          items: items.map((item) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            price: item.price,
          })),
          // Pass gclid as event param so GA4 can link to the Google Ads click
          ...(gclid && { gclid }),
        },
      },
    ],
  };

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[tracking-server] GA4 Measurement Protocol returned ${response.status}: ${response.statusText}`
      );
    }
  } catch (err) {
    console.error("[tracking-server] Failed to send GA4 server event:", err);
  }
}
