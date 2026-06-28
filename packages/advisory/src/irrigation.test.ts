import { test } from "node:test";
import assert from "node:assert/strict";
import { adviseIrrigation } from "./irrigation.js";
import type { Forecast, DailyForecast } from "./weather.js";

function fc(rain: number[], et0 = 5): Forecast {
  const days: DailyForecast[] = rain.map((mm, i) => ({
    date: `2026-04-${String(i + 1).padStart(2, "0")}`,
    rainfallMm: mm,
    precipProbability: 0.1,
    tempMaxC: 38,
    tempMinC: 24,
    et0Mm: et0,
  }));
  return { location: { lat: 18, lng: 76 }, days, fetchedAt: "2026-04-01T00:00:00Z" };
}

test("no irrigation when soil is wet and rain continues", () => {
  const a = adviseIrrigation({ forecast: fc([6, 6, 6, 6, 6, 6, 6]), soilMoisture: 0.9, soilType: "black" });
  assert.equal(a.irrigate, false);
  assert.equal(a.amountMm, 0);
});

test("irrigate today when soil critically dry and no rain", () => {
  const a = adviseIrrigation({ forecast: fc([0, 0, 0, 0, 0, 0, 0]), soilMoisture: 0.08, soilType: "loam" });
  assert.equal(a.irrigate, true);
  assert.equal(a.inDays, 0);
  assert.ok(a.amountMm > 0, "should recommend a positive depth");
  assert.equal(a.severity, "warning");
});

test("irrigation delayed several days when moisture moderate", () => {
  const a = adviseIrrigation({ forecast: fc([0, 0, 0, 0, 0, 0, 0]), soilMoisture: 0.6, soilType: "black" });
  assert.equal(a.irrigate, true);
  assert.ok(a.inDays >= 1, "buffer should last at least a day");
});

test("falls back to default ET0 when forecast lacks it", () => {
  const noEt: Forecast = { ...fc([0, 0, 0, 0, 0]), days: fc([0, 0, 0, 0, 0]).days.map((d) => ({ ...d, et0Mm: undefined })) };
  const a = adviseIrrigation({ forecast: noEt, soilMoisture: 0.1 });
  assert.equal(a.irrigate, true);
});
