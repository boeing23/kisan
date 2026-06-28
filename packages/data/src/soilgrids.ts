/**
 * SoilGrids connector (ISRIC, free, no key). Returns topsoil pH and a coarse
 * soil-type class derived from sand/clay fractions.
 *
 * SoilGrids serves 250 m cells; some exact points (water/urban masks) return
 * null, so we retry a few small offsets before giving up. A miss yields {} and
 * the reco engine falls back to neutral priors.
 *
 * Docs: https://rest.isric.org/soilgrids/v2.0/docs
 */
import type { GeoPoint } from "@kisan/core";

const BASE = "https://rest.isric.org/soilgrids/v2.0/properties/query";

export interface SoilInfo {
  /** Topsoil pH (water), ~4.5–9. */
  soilPh?: number;
  /** Coarse class matching the crop KB: "black" | "loam" | "sandy" | "clay". */
  soilType?: string;
  /** Clay / sand percentage of topsoil, for transparency. */
  clayPct?: number;
  sandPct?: number;
}

interface SoilGridsResponse {
  properties: {
    layers: Array<{
      name: string;
      depths: Array<{ values: { mean: number | null } }>;
    }>;
  };
}

/** Small offsets (deg) tried when the exact cell is no-data. ~0 then ~1–6 km. */
const OFFSETS: Array<[number, number]> = [
  [0, 0],
  [0.03, 0.03],
  [-0.03, 0.03],
  [0.05, -0.05],
];

export class SoilGridsClient {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async getSoil(point: GeoPoint): Promise<SoilInfo> {
    for (const [dLat, dLng] of OFFSETS) {
      const info = await this.queryPoint(point.lat + dLat, point.lng + dLng);
      if (info.soilPh !== undefined || info.soilType !== undefined) return info;
    }
    return {};
  }

  private async queryPoint(lat: number, lng: number): Promise<SoilInfo> {
    const params = new URLSearchParams();
    params.set("lon", String(lng));
    params.set("lat", String(lat));
    for (const prop of ["phh2o", "clay", "sand"]) params.append("property", prop);
    params.set("depth", "0-5cm");
    params.set("value", "mean");

    let json: SoilGridsResponse;
    try {
      const res = await this.fetchFn(`${BASE}?${params}`);
      if (!res.ok) return {};
      json = (await res.json()) as SoilGridsResponse;
    } catch {
      return {};
    }

    const mean = (name: string): number | undefined => {
      const layer = json.properties.layers.find((l) => l.name === name);
      const v = layer?.depths?.[0]?.values?.mean;
      return v == null ? undefined : v;
    };

    const ph = mean("phh2o");
    const clay = mean("clay"); // g/kg
    const sand = mean("sand"); // g/kg

    const info: SoilInfo = {};
    if (ph !== undefined) info.soilPh = ph / 10; // pH*10 -> pH
    if (clay !== undefined) info.clayPct = clay / 10;
    if (sand !== undefined) info.sandPct = sand / 10;
    if (info.clayPct !== undefined && info.sandPct !== undefined) {
      info.soilType = classifySoil(info.clayPct, info.sandPct);
    }
    return info;
  }
}

/**
 * Coarse soil class for the crop KB. Marathwada/Telangana are dominated by
 * clay-rich black cotton soil (regur), so high clay maps to "black".
 */
function classifySoil(clayPct: number, sandPct: number): string {
  if (clayPct >= 35) return "black";
  if (sandPct >= 65) return "sandy";
  if (clayPct >= 27) return "clay";
  return "loam";
}
