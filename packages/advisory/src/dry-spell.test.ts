/**
 * Unit tests for the dry-spell rules engine. Run: `node --test` (TS strip).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDrySpell, DEFAULT_THRESHOLDS } from "./dry-spell.js";
import type { Forecast, DailyForecast } from "./weather.js";

function day(date: string, rainfallMm: number): DailyForecast {
  return { date, rainfallMm, precipProbability: rainfallMm > 0 ? 0.6 : 0.1, tempMaxC: 34, tempMinC: 24 };
}

function forecast(rains: number[]): Forecast {
  const days = rains.map((mm, i) => day(`2026-07-${String(i + 1).padStart(2, "0")}`, mm));
  return { location: { lat: 18.0, lng: 76.5 }, days, fetchedAt: "2026-06-30T00:00:00Z" };
}

test("no dry spell when it rains regularly", () => {
  const r = detectDrySpell(forecast([5, 6, 4, 8, 5, 7, 5]));
  assert.equal(r.detected, false);
  assert.equal(r.severity, "info");
});

test("advisory at 5 consecutive dry days", () => {
  const r = detectDrySpell(forecast([0, 0, 0, 0, 0, 10, 10]));
  assert.equal(r.dryRunDays, 5);
  assert.equal(r.severity, "advisory");
  assert.equal(r.startDate, "2026-07-01");
});

test("warning at 7 dry days", () => {
  const r = detectDrySpell(forecast([0, 0, 0, 0, 0, 0, 0]));
  assert.equal(r.dryRunDays, 7);
  assert.equal(r.severity, "warning");
});

test("critical at 10 dry days", () => {
  const r = detectDrySpell(forecast(Array(10).fill(0)));
  assert.equal(r.severity, "critical");
});

test("light drizzle below threshold still counts as dry", () => {
  const r = detectDrySpell(forecast([1, 2, 1, 0, 2, 10, 10]));
  assert.equal(r.dryRunDays, 5); // all < 2.5mm
  assert.equal(r.severity, "advisory");
});

test("low soil moisture escalates severity one level", () => {
  const r = detectDrySpell(forecast([0, 0, 0, 0, 0, 10, 10]), 0.1);
  assert.equal(r.soilEscalated, true);
  assert.equal(r.severity, "warning"); // advisory -> warning
});

test("soil moisture does not escalate when no spell", () => {
  const r = detectDrySpell(forecast([5, 5, 5, 5, 5, 5, 5]), 0.05);
  assert.equal(r.soilEscalated, false);
  assert.equal(r.severity, "info");
});

test("longest run picked when multiple gaps", () => {
  const r = detectDrySpell(forecast([0, 0, 10, 0, 0, 0, 0, 0, 0, 10]), undefined, DEFAULT_THRESHOLDS);
  assert.equal(r.dryRunDays, 6);
  assert.equal(r.startDate, "2026-07-04");
});
