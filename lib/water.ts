/**
 * Water tracker — client-side store, daily-target calculator, and the substance
 * database that bumps the target. State lives in localStorage (single-user).
 *
 * Target model (ml/day):
 *   base      = weight_kg × 35            (NAM/IOM standard)
 *   exercise  = activity_hrs/wk ÷ 7 × 500 (~500 ml per training hour)
 *   caffeine  = max(0, mg − 200) × 1.5    (mild diuresis above ~2 cups)
 *   subs      = Σ dose × mlPerUnit        (per added stimulant/med)
 *   adjust    = +200 male, +100 if age ≥ 50
 */

export type WaterUnit = "bottle" | "glass" | "oz" | "ml";
export type WeightUnit = "kg" | "lb";
export type Sex = "m" | "f" | "o";

export interface WaterProfile {
  weightKg: number; // value as entered in the chosen weight unit
  age: number;
  sex: Sex;
  activityHrsPerWeek: number;
}

export interface WaterSubstance {
  id: string;
  name: string;
  cat: string;
  unit: string;
  mlPerUnit: number;
  defaultDose: number;
  dose: number;
}

export interface WaterState {
  unit: WaterUnit;
  weightUnit: WeightUnit;
  bottleMl: number;
  glassMl: number;
  profile: WaterProfile;
  caffeineMgPerDay: number;
  substances: WaterSubstance[];
  logs: Record<string, number>; // YYYY-MM-DD -> servings
}

export interface TargetBreakdown {
  base: number;
  exercise: number;
  caffeine: number;
  subs: number;
  adjust: number;
  total: number;
}

export const WATER_LS_KEY = "kova_water_v1";
export const WATER_CHANGED_EVENT = "water-changed";

const DEFAULTS: Omit<WaterState, "logs"> = {
  unit: "bottle",
  weightUnit: "kg",
  bottleMl: 500,
  glassMl: 250,
  profile: { weightKg: 75, age: 25, sex: "m", activityHrsPerWeek: 5 },
  caffeineMgPerDay: 200,
  substances: [],
};

/** Stimulants / meds whose daily water bump scales with the user's dose. */
export const SUBSTANCE_DB: Omit<WaterSubstance, "dose">[] = [
  { id: "adderall", name: "Adderall (mixed amphetamine salts)", cat: "ADHD stim", unit: "mg", defaultDose: 20, mlPerUnit: 25 },
  { id: "concerta", name: "Concerta (methylphenidate ER)", cat: "ADHD stim", unit: "mg", defaultDose: 36, mlPerUnit: 13.9 },
  { id: "vyvanse", name: "Vyvanse (lisdexamfetamine)", cat: "ADHD stim", unit: "mg", defaultDose: 50, mlPerUnit: 10 },
  { id: "ritalin", name: "Ritalin IR (methylphenidate)", cat: "ADHD stim", unit: "mg", defaultDose: 20, mlPerUnit: 20 },
  { id: "focalin", name: "Focalin / Focalin XR", cat: "ADHD stim", unit: "mg", defaultDose: 20, mlPerUnit: 20 },
  { id: "modafinil", name: "Modafinil", cat: "Wakefulness", unit: "mg", defaultDose: 200, mlPerUnit: 1.75 },
  { id: "lithium", name: "Lithium", cat: "Mood", unit: "mg", defaultDose: 600, mlPerUnit: 1.67 },
  { id: "hctz", name: "Hydrochlorothiazide (HCTZ)", cat: "Diuretic", unit: "mg", defaultDose: 25, mlPerUnit: 40 },
  { id: "lasix", name: "Furosemide (Lasix)", cat: "Diuretic", unit: "mg", defaultDose: 40, mlPerUnit: 30 },
  { id: "spironol", name: "Spironolactone", cat: "Diuretic", unit: "mg", defaultDose: 50, mlPerUnit: 12 },
  { id: "sudafed", name: "Pseudoephedrine (Sudafed)", cat: "Decongestant", unit: "mg", defaultDose: 60, mlPerUnit: 4.17 },
  { id: "phenyl", name: "Phenylephrine", cat: "Decongestant", unit: "mg", defaultDose: 10, mlPerUnit: 20 },
  { id: "nicotine", name: "Nicotine pouch (Velo / Zyn)", cat: "Stim", unit: "pouches/day", defaultDose: 4, mlPerUnit: 62.5 },
  { id: "nicpatch", name: "Nicotine patch", cat: "Stim", unit: "mg", defaultDose: 14, mlPerUnit: 18 },
  { id: "alcohol", name: "Alcohol", cat: "Depressant", unit: "drinks/day", defaultDose: 1, mlPerUnit: 400 },
  { id: "cannabis", name: "Cannabis / THC", cat: "Other", unit: "sessions/day", defaultDose: 1, mlPerUnit: 250 },
  { id: "creatine", name: "Creatine monohydrate", cat: "Supplement", unit: "g/day", defaultDose: 5, mlPerUnit: 80 },
  { id: "preworkout", name: "Pre-workout (caffeine + others)", cat: "Stim", unit: "servings/day", defaultDose: 1, mlPerUnit: 300 },
  { id: "metformin", name: "Metformin", cat: "Glucose", unit: "mg", defaultDose: 1000, mlPerUnit: 0.3 },
  { id: "ssri", name: "SSRI (sertraline / escitalopram / fluoxetine)", cat: "SSRI", unit: "mg", defaultDose: 50, mlPerUnit: 4 },
  { id: "wellbutrin", name: "Bupropion (Wellbutrin)", cat: "NDRI", unit: "mg", defaultDose: 300, mlPerUnit: 1.17 },
];

export function normalizeWater(input: Partial<WaterState> | null | undefined): WaterState {
  const s = input ?? {};
  return {
    unit: s.unit ?? DEFAULTS.unit,
    weightUnit: s.weightUnit ?? DEFAULTS.weightUnit,
    bottleMl: s.bottleMl ?? DEFAULTS.bottleMl,
    glassMl: s.glassMl ?? DEFAULTS.glassMl,
    profile: { ...DEFAULTS.profile, ...(s.profile ?? {}) },
    caffeineMgPerDay: s.caffeineMgPerDay ?? DEFAULTS.caffeineMgPerDay,
    substances: Array.isArray(s.substances) ? s.substances : [],
    logs: s.logs && typeof s.logs === "object" ? s.logs : {},
  };
}

export function loadWater(): WaterState {
  if (typeof window === "undefined") return normalizeWater(null);
  try {
    const raw = window.localStorage.getItem(WATER_LS_KEY);
    return normalizeWater(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeWater(null);
  }
}

export function saveWater(state: WaterState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATER_LS_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(WATER_CHANGED_EVENT));
}

export function waterDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function subExtraMl(s: WaterSubstance): number {
  const dose = s.dose ?? s.defaultDose ?? 0;
  return Math.max(0, dose * (s.mlPerUnit || 0));
}

export function subDoseLabel(s: WaterSubstance): string {
  return `${s.dose ?? s.defaultDose} ${s.unit || ""}`.trim();
}

export function computeTargetMl(state: WaterState): TargetBreakdown {
  const p = state.profile;
  const wKg = state.weightUnit === "lb" ? p.weightKg / 2.20462 : p.weightKg;
  const base = wKg * 35;
  const exercise = ((p.activityHrsPerWeek || 0) / 7) * 500;
  const caffeine = Math.max(0, (state.caffeineMgPerDay || 0) - 200) * 1.5;
  const subs = (state.substances || []).reduce((sum, x) => sum + subExtraMl(x), 0);
  let adjust = 0;
  if (p.sex === "m") adjust += 200;
  if ((p.age || 0) >= 50) adjust += 100;
  return { base, exercise, caffeine, subs, adjust, total: base + exercise + caffeine + subs + adjust };
}

export function unitVolMl(state: WaterState): number {
  if (state.unit === "bottle") return state.bottleMl || 500;
  if (state.unit === "glass") return state.glassMl || 250;
  if (state.unit === "oz") return 30; // ~29.57 ml
  return 1;
}

export function unitLabel(state: WaterState, plural: boolean): string {
  const map: Record<WaterUnit, [string, string]> = {
    bottle: ["bottle", "bottles"],
    glass: ["glass", "glasses"],
    oz: ["oz", "oz"],
    ml: ["ml", "ml"],
  };
  return map[state.unit][plural ? 1 : 0];
}

export function fmtMl(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`;
  return `${Math.round(ml)} ml`;
}

export function targetUnits(state: WaterState): number {
  return Math.max(1, Math.ceil(computeTargetMl(state).total / unitVolMl(state)));
}
