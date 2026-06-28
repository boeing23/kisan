/**
 * Earth Engine NDVI + soil-moisture sampler.
 *
 * Uses the official @google/earthengine client (Node), authenticated with the
 * project service account. EE computes everything server-side — we only send a
 * point/polygon and receive numbers. No raster download, no Python.
 *
 * NDVI source: Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED), cloud-masked,
 * median over a recent window. Soil moisture: NASA SMAP L3 enhanced
 * (NASA/SMAP/SPL3SMP_E/006, band soil_moisture_am) — the L4 global product
 * (SPL4SMGP) currently lags with no recent images.
 */
import { readFileSync } from "node:fs";
import ee from "@google/earthengine";
import type { GeoPoint } from "@kisan/core";
import type { Season } from "./crops.js";

/** Indian agricultural seasons by month (kharif: Jun–Oct, rabi: Nov–Mar, zaid: Apr–May). */
export function currentSeason(date = new Date()): Season {
  const m = date.getMonth() + 1; // 1..12
  if (m >= 6 && m <= 10) return "kharif";
  if (m >= 11 || m <= 3) return "rabi";
  return "zaid";
}

export interface FieldSignals {
  ndvi?: number;
  soilMoisture?: number;
}

export class EarthEngineClient {
  private ready: Promise<void> | null = null;

  constructor(private readonly serviceAccountPath: string) {}

  /** Authenticate + initialise EE once; subsequent calls reuse the session. */
  private init(): Promise<void> {
    if (this.ready) return this.ready;
    const key = JSON.parse(readFileSync(this.serviceAccountPath, "utf8"));
    this.ready = new Promise<void>((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(
        key,
        () => ee.initialize(null, null, () => resolve(), reject),
        reject
      );
    });
    return this.ready;
  }

  /** Promisify ee object .getInfo(). */
  private getInfo<T>(obj: { getInfo: (cb: (v: T, err?: string) => void) => void }): Promise<T> {
    return new Promise((resolve, reject) => {
      obj.getInfo((v, err) => (err ? reject(new Error(err)) : resolve(v)));
    });
  }

  /**
   * Mean NDVI over a field for the last `windowDays` days.
   * Accepts a centroid (buffered to a small disc) or an explicit polygon.
   */
  async sampleNdvi(location: GeoPoint, opts?: { polygon?: GeoPoint[]; windowDays?: number }): Promise<number | undefined> {
    await this.init();
    const region = this.regionFor(location, opts?.polygon);
    const end = ee.Date(Date.now());
    const start = end.advance(-(opts?.windowDays ?? 30), "day");

    const ndviImg = ee
      .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(region)
      .filterDate(start, end)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
      .map((img: any) => img.normalizedDifference(["B8", "B4"]).rename("ndvi"))
      .median();

    const dict = ndviImg.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: 10,
      maxPixels: 1e8,
    });
    const result = await this.getInfo<Record<string, number>>(dict);
    return result?.ndvi;
  }

  /**
   * Mean volumetric soil moisture (m³/m³, ~0..0.5) from SMAP L3 enhanced over
   * the last window. SMAP pixels are ~9km, so we sample at 9km scale; the small
   * field region intersects the overlying pixel.
   */
  async sampleSoilMoisture(location: GeoPoint, opts?: { polygon?: GeoPoint[]; windowDays?: number }): Promise<number | undefined> {
    await this.init();
    // SMAP pixels are ~9km. A field-sized region falls inside a single pixel and
    // reduceRegion returns null, so sample over a 10km disc around the field.
    const region = opts?.polygon && opts.polygon.length >= 3
      ? ee.Geometry.Polygon([opts.polygon.map((p) => [p.lng, p.lat])])
      : ee.Geometry.Point([location.lng, location.lat]).buffer(10000);
    const end = ee.Date(Date.now());
    const start = end.advance(-(opts?.windowDays ?? 10), "day");

    const sm = ee
      .ImageCollection("NASA/SMAP/SPL3SMP_E/006")
      .filterDate(start, end)
      .select("soil_moisture_am")
      .mean();

    const dict = sm.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: 9000,
      maxPixels: 1e8,
      bestEffort: true,
    });
    const result = await this.getInfo<Record<string, number>>(dict);
    const v = result?.soil_moisture_am;
    return v == null ? undefined : v;
  }

  /** Convenience: fetch both signals for a field in parallel. */
  async sampleField(location: GeoPoint, polygon?: GeoPoint[]): Promise<FieldSignals> {
    const [ndvi, soilMoisture] = await Promise.all([
      this.sampleNdvi(location, { polygon }),
      this.sampleSoilMoisture(location, { polygon }),
    ]);
    return { ndvi, soilMoisture };
  }

  private regionFor(location: GeoPoint, polygon?: GeoPoint[]) {
    if (polygon && polygon.length >= 3) {
      return ee.Geometry.Polygon([polygon.map((p) => [p.lng, p.lat])]);
    }
    // Buffer the centroid to a ~100m disc so a single Sentinel pixel isn't relied on.
    return ee.Geometry.Point([location.lng, location.lat]).buffer(100);
  }
}
