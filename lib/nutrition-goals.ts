import { DEFAULT_GOALS, type NutritionGoals } from "@/lib/nutrition";

const LB_PER_KG = 2.204_622_621_8;

export type BurnSource = "oura_total" | "oura_active_bmr" | "estimated";

export type NutritionGoalMeta = {
  current_weight_lbs: number | null;
  current_body_fat_pct: number | null;
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
  bmr: number;
  oura_burn: number;
  burn_source: BurnSource;
  calorie_adjustment: number;
  adjustment_reason: string | null;
};

export type ComputedNutritionGoals = NutritionGoals & { meta: NutritionGoalMeta };

export type GoalInputs = {
  weight_lbs: number | null;
  body_fat_pct: number | null;
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
  height_m: number | null;
  age: number | null;
  biological_sex: string | null;
  oura_total_calories: number | null;
  oura_active_calories: number | null;
  water_goal_ml: number | null;
};

export function lbsToKg(lbs: number): number {
  return lbs / LB_PER_KG;
}

export function kgToLbs(kg: number): number {
  return kg * LB_PER_KG;
}

function defaultBodyFatPct(sex: string | null): number {
  const s = sex?.toLowerCase() ?? "";
  if (s.includes("female") || s === "f") return 25;
  if (s.includes("male") || s === "m") return 18;
  return 20;
}

/** Mifflin–St Jeor basal metabolic rate (kcal/day). */
export function mifflinStJeorBmr(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: string | null;
}): number {
  const base =
    10 * params.weightKg + 6.25 * params.heightCm - 5 * params.age;
  const s = params.sex?.toLowerCase() ?? "";
  if (s.includes("female") || s === "f") return base - 161;
  return base + 5;
}

export function estimateDailyBurn(input: {
  bmr: number;
  oura_total_calories: number | null;
  oura_active_calories: number | null;
}): { burn: number; source: BurnSource } {
  if (input.oura_total_calories != null && input.oura_total_calories > 0) {
    return { burn: Math.round(input.oura_total_calories), source: "oura_total" };
  }
  if (input.oura_active_calories != null && input.oura_active_calories >= 0) {
    return {
      burn: Math.round(input.bmr * 0.2 + input.oura_active_calories),
      source: "oura_active_bmr",
    };
  }
  return { burn: Math.round(input.bmr * 1.375), source: "estimated" };
}

export function calorieAdjustment(input: {
  current_weight_lbs: number;
  weight_goal_lbs: number | null;
  current_body_fat_pct: number;
  body_fat_goal_pct: number | null;
}): { adjustment: number; reason: string | null } {
  let adjustment = 0;
  const reasons: string[] = [];

  if (input.weight_goal_lbs != null) {
    const delta = input.current_weight_lbs - input.weight_goal_lbs;
    if (delta > 1) {
      adjustment -= 500;
      reasons.push(`−500 toward ${input.weight_goal_lbs} lb`);
    } else if (delta < -1) {
      adjustment += 300;
      reasons.push(`+300 toward ${input.weight_goal_lbs} lb`);
    }
  }

  if (
    input.body_fat_goal_pct != null &&
    input.current_body_fat_pct > input.body_fat_goal_pct + 0.5 &&
    adjustment >= 0
  ) {
    adjustment -= 400;
    reasons.push(`−400 toward ${input.body_fat_goal_pct}% body fat`);
  }

  return {
    adjustment,
    reason: reasons.length > 0 ? reasons.join(" · ") : null,
  };
}

/** Derive daily macro targets from body composition, Oura burn, and goals. */
export function computeNutritionGoals(input: GoalInputs): ComputedNutritionGoals {
  const weight_lbs = input.weight_lbs ?? 170;
  const weight_kg = lbsToKg(weight_lbs);
  const body_fat =
    input.body_fat_pct ?? defaultBodyFatPct(input.biological_sex);
  const lean_kg = weight_kg * (1 - body_fat / 100);

  // ~1 g protein per lb of lean mass (common recomp target).
  const protein_g = Math.round(Math.max(lean_kg * 2.2, 80) / 5) * 5;

  const height_cm = (input.height_m ?? 1.75) * 100;
  const age = input.age ?? 30;
  const bmr = Math.round(
    mifflinStJeorBmr({
      weightKg: weight_kg,
      heightCm: height_cm,
      age,
      sex: input.biological_sex,
    }),
  );

  const { burn, source } = estimateDailyBurn({
    bmr,
    oura_total_calories: input.oura_total_calories,
    oura_active_calories: input.oura_active_calories,
  });

  const { adjustment, reason } = calorieAdjustment({
    current_weight_lbs: weight_lbs,
    weight_goal_lbs: input.weight_goal_lbs,
    current_body_fat_pct: body_fat,
    body_fat_goal_pct: input.body_fat_goal_pct,
  });

  const calories = Math.max(1200, Math.round(burn + adjustment));

  const protein_cal = protein_g * 4;
  const remaining = Math.max(0, calories - protein_cal);
  const fat_g = Math.round((remaining * 0.3) / 9);
  const carbs_g = Math.round((remaining * 0.7) / 4);

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    water_ml: input.water_goal_ml ?? DEFAULT_GOALS.water_ml,
    meta: {
      current_weight_lbs: input.weight_lbs,
      current_body_fat_pct: input.body_fat_pct,
      weight_goal_lbs: input.weight_goal_lbs,
      body_fat_goal_pct: input.body_fat_goal_pct,
      bmr,
      oura_burn: burn,
      burn_source: source,
      calorie_adjustment: adjustment,
      adjustment_reason: reason,
    },
  };
}

export function burnSourceLabel(source: BurnSource): string {
  switch (source) {
    case "oura_total":
      return "Oura total burn";
    case "oura_active_bmr":
      return "BMR + Oura active calories";
    case "estimated":
      return "Estimated maintenance";
  }
}
