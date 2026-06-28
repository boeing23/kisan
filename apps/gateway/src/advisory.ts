/**
 * Advisory composition — turns a field into actionable irrigation,
 * fertilization, and dry-spell guidance for the farmer.
 *
 * Soil moisture is taken from a fresh ground sensor when available, else from
 * satellite (via the cached signal assembler). This is where "ground sensor
 * data + localized weather" come together into irrigation/fertilization advice.
 */
import type { Field, LanguageCode } from "@kisan/core";
import { getFreshReading } from "@kisan/db";
import {
  adviseIrrigation,
  adviseFertilization,
  detectDrySpell,
  irrigationMessage,
  fertilizationMessage,
  drySpellMessage,
  type IrrigationAdvice,
  type FertilizationAdvice,
  type DrySpellResult,
} from "@kisan/advisory";
import { buildFieldSignals, type SignalSources } from "./signals.js";

export interface FieldAdvisory {
  irrigation: IrrigationAdvice;
  fertilization: FertilizationAdvice;
  drySpell: DrySpellResult;
  /** Where the soil-moisture input came from. */
  moistureSource: "sensor" | "satellite" | "none";
  /** Localized, farmer-ready messages (empty string = nothing to say). */
  messages: { irrigation: string; fertilization: string; drySpell: string };
}

export async function buildAdvisory(
  field: Field,
  language: LanguageCode,
  sources: SignalSources
): Promise<FieldAdvisory> {
  // 7-day forecast (rain + ET0) drives the water balance.
  const forecast = await sources.weather.getForecast(field.location, 7);

  // Prefer a fresh ground sensor; else satellite soil moisture from cached signals.
  const sensor = await getFreshReading(field.id);
  let moisture: number | undefined;
  let moistureSource: FieldAdvisory["moistureSource"] = "none";
  if (sensor) {
    moisture = sensor.soilMoisture;
    moistureSource = "sensor";
  } else {
    const signals = await buildFieldSignals(field, sources);
    moisture = signals.soilMoisture;
    if (moisture !== undefined) moistureSource = "satellite";
  }

  const irrigation = adviseIrrigation({
    forecast,
    soilMoisture: moisture,
    soilType: field.soilType,
  });
  const drySpell = detectDrySpell(forecast, moisture);
  const fertilization = adviseFertilization(field.currentCrop, field.sowingDate);

  return {
    irrigation,
    fertilization,
    drySpell,
    moistureSource,
    messages: {
      irrigation: irrigationMessage(irrigation, language),
      fertilization: fertilizationMessage(fertilization, language),
      drySpell: drySpell.detected ? drySpellMessage(drySpell, language) : "",
    },
  };
}
