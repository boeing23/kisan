/**
 * Groundwater depth-to-water table for the pilot districts.
 *
 * India has no clean free real-time groundwater API; CGWB publishes district
 * pre-monsoon depth-to-water in the Ground Water Year Book. These are
 * representative pre-monsoon values (metres below ground) for the pilot
 * districts, with a per-state fallback. Replace with an India-WRIS / CGWB API
 * pull when one is available without scraping.
 */
import type { StateCode } from "@kisan/core";

/** Pre-monsoon depth-to-water (m bgl), approximate, by state + district. */
const TABLE: Record<StateCode, Record<string, number>> = {
  MH: {
    Beed: 9,
    Latur: 7,
    Osmanabad: 8,
    Dharashiv: 8,
    Nanded: 6,
    Parbhani: 7,
    Jalna: 10,
    Aurangabad: 11,
    Chh_Sambhajinagar: 11,
  },
  TG: {
    Nalgonda: 13,
    Mahbubnagar: 16,
    Mahabubnagar: 16,
    Khammam: 9,
    Warangal: 11,
    Nizamabad: 8,
    Suryapet: 12,
  },
};

/** Per-state fallback when the district isn't in the table. */
const STATE_DEFAULT: Record<StateCode, number> = { MH: 9, TG: 13 };

/** Depth to groundwater (m below ground). Undefined only for unknown states. */
export function groundwaterDepthM(state: StateCode, district?: string): number | undefined {
  const byDistrict = TABLE[state];
  if (!byDistrict) return undefined;
  if (district) {
    const key = district.trim().replace(/\s+/g, "_");
    const exact = byDistrict[district.trim()] ?? byDistrict[key];
    if (exact !== undefined) return exact;
  }
  return STATE_DEFAULT[state];
}
