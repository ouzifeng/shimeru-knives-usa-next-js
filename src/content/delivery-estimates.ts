// State-by-state delivery estimates, shipping from Bolingbrook, IL (60490)
// via UniUni/OSM, per InSync's zone map. Bands count transit only and assume
// same-day processing for orders placed before 1pm CT. See lib/delivery.ts for
// how they are turned into dates: dispatch is Mon-Fri, transit is Mon-Sat.
//
// Zone assignments are approximate. Several large states span two zones, in
// which case the busier metro decides the band (Texas is mapped on Dallas,
// not El Paso). State-level is deliberate: a zip-to-zone lookup would be more
// precise but is not worth the complexity for a customer-facing estimate.

export type DeliveryBandKey = "zones2to4" | "zones5to6" | "zones7to8" | "noncontiguous";

export interface DeliveryBand {
  minDays: number;
  maxDays: number;
  /** Plain-language range, for copy that has no specific state selected. */
  label: string;
}

export const DELIVERY_BANDS: Record<DeliveryBandKey, DeliveryBand> = {
  zones2to4: { minDays: 1, maxDays: 2, label: "1-2 business days" },
  zones5to6: { minDays: 3, maxDays: 4, label: "3-4 business days" },
  zones7to8: { minDays: 4, maxDays: 5, label: "4-5 business days" },
  // Alaska and Hawaii sit in zone 8 but often fall outside UniUni coverage and
  // route via OSM instead, which runs longer than the zone 8 band suggests.
  // Padded deliberately so these customers are under-promised, not over-.
  noncontiguous: { minDays: 5, maxDays: 7, label: "5-7 business days" },
};

/** Fastest to slowest, for rendering the band table in a sensible order. */
export const DELIVERY_BAND_ORDER: DeliveryBandKey[] = [
  "zones2to4",
  "zones5to6",
  "zones7to8",
  "noncontiguous",
];

export interface DeliveryState {
  code: string;
  name: string;
  band: DeliveryBandKey;
}

/** All 50 states plus DC, alphabetical by name for the dropdown. */
export const DELIVERY_STATES: DeliveryState[] = [
  { code: "AL", name: "Alabama", band: "zones5to6" },
  { code: "AK", name: "Alaska", band: "noncontiguous" },
  { code: "AZ", name: "Arizona", band: "zones7to8" },
  { code: "AR", name: "Arkansas", band: "zones2to4" },
  { code: "CA", name: "California", band: "zones7to8" },
  { code: "CO", name: "Colorado", band: "zones5to6" },
  { code: "CT", name: "Connecticut", band: "zones5to6" },
  { code: "DE", name: "Delaware", band: "zones5to6" },
  { code: "DC", name: "District of Columbia", band: "zones5to6" },
  { code: "FL", name: "Florida", band: "zones5to6" },
  { code: "GA", name: "Georgia", band: "zones5to6" },
  { code: "HI", name: "Hawaii", band: "noncontiguous" },
  { code: "ID", name: "Idaho", band: "zones7to8" },
  { code: "IL", name: "Illinois", band: "zones2to4" },
  { code: "IN", name: "Indiana", band: "zones2to4" },
  { code: "IA", name: "Iowa", band: "zones2to4" },
  { code: "KS", name: "Kansas", band: "zones2to4" },
  { code: "KY", name: "Kentucky", band: "zones2to4" },
  { code: "LA", name: "Louisiana", band: "zones5to6" },
  { code: "ME", name: "Maine", band: "zones5to6" },
  { code: "MD", name: "Maryland", band: "zones5to6" },
  { code: "MA", name: "Massachusetts", band: "zones5to6" },
  { code: "MI", name: "Michigan", band: "zones2to4" },
  { code: "MN", name: "Minnesota", band: "zones2to4" },
  { code: "MS", name: "Mississippi", band: "zones5to6" },
  { code: "MO", name: "Missouri", band: "zones2to4" },
  { code: "MT", name: "Montana", band: "zones5to6" },
  { code: "NE", name: "Nebraska", band: "zones2to4" },
  { code: "NV", name: "Nevada", band: "zones7to8" },
  { code: "NH", name: "New Hampshire", band: "zones5to6" },
  { code: "NJ", name: "New Jersey", band: "zones5to6" },
  { code: "NM", name: "New Mexico", band: "zones5to6" },
  { code: "NY", name: "New York", band: "zones5to6" },
  { code: "NC", name: "North Carolina", band: "zones5to6" },
  { code: "ND", name: "North Dakota", band: "zones5to6" },
  { code: "OH", name: "Ohio", band: "zones2to4" },
  { code: "OK", name: "Oklahoma", band: "zones5to6" },
  { code: "OR", name: "Oregon", band: "zones7to8" },
  { code: "PA", name: "Pennsylvania", band: "zones5to6" },
  { code: "RI", name: "Rhode Island", band: "zones5to6" },
  { code: "SC", name: "South Carolina", band: "zones5to6" },
  { code: "SD", name: "South Dakota", band: "zones5to6" },
  { code: "TN", name: "Tennessee", band: "zones2to4" },
  { code: "TX", name: "Texas", band: "zones5to6" },
  { code: "UT", name: "Utah", band: "zones7to8" },
  { code: "VT", name: "Vermont", band: "zones5to6" },
  { code: "VA", name: "Virginia", band: "zones5to6" },
  { code: "WA", name: "Washington", band: "zones7to8" },
  { code: "WV", name: "West Virginia", band: "zones5to6" },
  { code: "WI", name: "Wisconsin", band: "zones2to4" },
  { code: "WY", name: "Wyoming", band: "zones5to6" },
];

export function getBandForState(code: string): DeliveryBand | null {
  const match = DELIVERY_STATES.find((s) => s.code === code);
  return match ? DELIVERY_BANDS[match.band] : null;
}

/** Range quoted before a customer picks a state. Covers the contiguous 48,
 *  so it stays honest without being dragged out to 7 days by Alaska/Hawaii. */
export const LOWER_48_RANGE = "1-5 business days";

/** localStorage key, so a chosen state follows the customer across the site. */
export const DELIVERY_STATE_KEY = "shimeru_delivery_state";
