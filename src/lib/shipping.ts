import { getShippingZones, getShippingZoneMethods } from "./woocommerce";
import type { WCShippingMethod, WCShippingZone } from "./types";

export interface ShippingOption {
  id: string;
  title: string;
  cost: number;
  zoneName: string;
  methodId: string;
  enabled: boolean;
}

export interface ShippingZoneWithMethods {
  zone: WCShippingZone;
  methods: WCShippingMethod[];
}

/** Fetch all shipping zones and their methods from WooCommerce */
export async function getAllShippingZonesWithMethods(): Promise<ShippingZoneWithMethods[]> {
  const zones = await getShippingZones();
  const results = await Promise.all(
    zones.map(async (zone) => {
      try {
        const methods = await getShippingZoneMethods(zone.id);
        return { zone, methods };
      } catch {
        return { zone, methods: [] };
      }
    })
  );
  return results;
}

/** Get enabled shipping options for checkout (across all zones) */
export async function getShippingOptions(): Promise<ShippingOption[]> {
  const zonesWithMethods = await getAllShippingZonesWithMethods();

  const options: ShippingOption[] = [];

  for (const { zone, methods } of zonesWithMethods) {
    for (const method of methods) {
      if (!method.enabled) continue;

      const title = method.settings.title?.value || method.method_title;

      // Free shipping has no cost
      if (method.method_id === "free_shipping") {
        options.push({
          id: `${method.method_id}:${method.instance_id}`,
          title,
          cost: 0,
          zoneName: zone.name,
          methodId: method.method_id,
          enabled: method.enabled,
        });
        continue;
      }

      // Flat rate, local pickup, etc.
      const cost = parseFloat(method.settings.cost?.value || "0");
      options.push({
        id: `${method.method_id}:${method.instance_id}`,
        title,
        cost,
        zoneName: zone.name,
        methodId: method.method_id,
        enabled: method.enabled,
      });
    }
  }

  return options;
}
