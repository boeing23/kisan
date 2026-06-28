/**
 * Pilot districts with representative centroids. Used to place a farmer's field
 * when they pick a district (no per-farm GPS yet) and to drive weather/satellite
 * lookups. Centroids are approximate district HQ coordinates. Districts here
 * match the groundwater table so depth lookups resolve.
 */
import type { StateCode, GeoPoint } from "@kisan/core";

export interface District {
  name: string;
  center: GeoPoint;
}

export const DISTRICTS: Record<StateCode, District[]> = {
  MH: [
    { name: "Beed", center: { lat: 18.99, lng: 75.76 } },
    { name: "Latur", center: { lat: 18.41, lng: 76.57 } },
    { name: "Osmanabad", center: { lat: 18.19, lng: 76.04 } },
    { name: "Nanded", center: { lat: 19.16, lng: 77.31 } },
    { name: "Parbhani", center: { lat: 19.27, lng: 76.78 } },
    { name: "Jalna", center: { lat: 19.84, lng: 75.88 } },
    { name: "Aurangabad", center: { lat: 19.88, lng: 75.34 } },
  ],
  TG: [
    { name: "Nalgonda", center: { lat: 17.05, lng: 79.27 } },
    { name: "Mahbubnagar", center: { lat: 16.74, lng: 78.0 } },
    { name: "Khammam", center: { lat: 17.25, lng: 80.15 } },
    { name: "Warangal", center: { lat: 17.97, lng: 79.59 } },
    { name: "Nizamabad", center: { lat: 18.67, lng: 78.09 } },
    { name: "Suryapet", center: { lat: 17.14, lng: 79.62 } },
  ],
};

/** Look up a district's centroid; falls back to the state's first district. */
export function districtCenter(state: StateCode, name?: string): { district: string; center: GeoPoint } {
  const list = DISTRICTS[state] ?? [];
  const found = name ? list.find((d) => d.name.toLowerCase() === name.toLowerCase()) : undefined;
  const d = found ?? list[0]!;
  return { district: d.name, center: d.center };
}
