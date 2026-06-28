/**
 * Fertilization advisory — crop-stage schedule keyed by days-after-sowing.
 *
 * Each crop has a few fertilizer events (basal dose at sowing, top-dressings at
 * growth stages). Given the sowing date, we surface the event that's due now
 * (within a window). Deterministic, no LLM — these are standard state ag-dept
 * package-of-practice recommendations.
 */
export type FertEvent = {
  /** Days after sowing this dose is due. */
  day: number;
  /** Stage label for context. */
  stage: string;
  /** What to apply (kept generic; localized in messages). */
  action: "basal" | "top_dress_1" | "top_dress_2";
};

/** Per-crop fertilizer timeline (days after sowing). */
const SCHEDULES: Record<string, FertEvent[]> = {
  cotton: [
    { day: 0, stage: "sowing", action: "basal" },
    { day: 30, stage: "squaring", action: "top_dress_1" },
    { day: 60, stage: "flowering", action: "top_dress_2" },
  ],
  soybean: [
    { day: 0, stage: "sowing", action: "basal" },
    { day: 30, stage: "branching", action: "top_dress_1" },
  ],
  tur: [
    { day: 0, stage: "sowing", action: "basal" },
    { day: 45, stage: "branching", action: "top_dress_1" },
  ],
  bajra: [
    { day: 0, stage: "sowing", action: "basal" },
    { day: 25, stage: "tillering", action: "top_dress_1" },
  ],
  jowar: [
    { day: 0, stage: "sowing", action: "basal" },
    { day: 30, stage: "knee-high", action: "top_dress_1" },
  ],
  maize: [
    { day: 0, stage: "sowing", action: "basal" },
    { day: 25, stage: "knee-high", action: "top_dress_1" },
    { day: 45, stage: "tasseling", action: "top_dress_2" },
  ],
  rice: [
    { day: 0, stage: "transplant", action: "basal" },
    { day: 25, stage: "tillering", action: "top_dress_1" },
    { day: 45, stage: "panicle", action: "top_dress_2" },
  ],
};

/** ± window (days) around an event during which we flag it as due. */
const WINDOW = 4;

export interface FertilizationAdvice {
  due: boolean;
  action?: FertEvent["action"];
  stage?: string;
  daysAfterSowing: number;
}

/** Days between sowing and a reference date. */
export function daysAfterSowing(sowingDateIso: string, now = new Date()): number {
  const sown = new Date(sowingDateIso).getTime();
  return Math.floor((now.getTime() - sown) / (24 * 3600 * 1000));
}

/**
 * Find the fertilizer event due within the window of the current crop age.
 * Returns due=false when nothing is scheduled near now.
 */
export function adviseFertilization(
  crop: string | undefined,
  sowingDateIso: string | undefined,
  now = new Date()
): FertilizationAdvice {
  if (!crop || !sowingDateIso) return { due: false, daysAfterSowing: 0 };
  const schedule = SCHEDULES[crop.toLowerCase()];
  const age = daysAfterSowing(sowingDateIso, now);
  if (!schedule) return { due: false, daysAfterSowing: age };

  const hit = schedule.find((e) => Math.abs(age - e.day) <= WINDOW);
  if (!hit) return { due: false, daysAfterSowing: age };
  return { due: true, action: hit.action, stage: hit.stage, daysAfterSowing: age };
}
