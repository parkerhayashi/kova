import { addDays, shortDate } from "@/lib/utils";
import type { DualTrendView } from "@/lib/trends/types";
import type { WeightLog } from "@/types";

function sortedDates(...sources: Map<string, number>[]): string[] {
  const set = new Set<string>();
  for (const map of sources) {
    for (const date of map.keys()) set.add(date);
  }
  return [...set].sort();
}

/** Carry the last logged weight forward so the line connects between weigh-ins. */
export function forwardFillWeight(
  weight: WeightLog[],
  dates: string[],
): (number | null)[] {
  if (weight.length === 0) return dates.map(() => null);

  const byDate = new Map(weight.map((w) => [w.date, w.weight_lbs]));
  const firstDate = weight.reduce(
    (min, w) => (w.date < min ? w.date : min),
    weight[0].date,
  );
  let last: number | null = null;

  return dates.map((date) => {
    const exact = byDate.get(date);
    if (exact != null) last = exact;
    if (date < firstDate) return null;
    return last;
  });
}

function mapValue(map: Map<string, number>, date: string): number | null {
  const value = map.get(date);
  return value != null && value > 0 ? value : null;
}

export function buildNutritionCaloriesVsWeight(
  caloriesByDay: Map<string, number>,
  weight: WeightLog[],
  rangeDates?: string[],
): DualTrendView {
  const dates =
    rangeDates ??
    sortedDates(
      caloriesByDay,
      new Map(weight.map((w) => [w.date, w.weight_lbs])),
    );

  const labels: string[] = [];
  const calories: (number | null)[] = [];
  const weights = forwardFillWeight(weight, dates);

  for (const date of dates) {
    labels.push(shortDate(date));
    calories.push(mapValue(caloriesByDay, date));
  }

  return {
    id: "nutrition-calories-weight",
    title: "Calorie Intake vs. Weight",
    subtitle: "Daily calories logged (meals + supplements) overlaid with body weight",
    labels,
    primary: calories,
    secondary: weights,
    primaryLabel: "Calories",
    secondaryLabel: "Weight (lb)",
    primaryAccent: "nutrition",
    secondaryAccent: "recovery",
    emptyHint: "Log meals and body weight to see how intake tracks with the scale.",
  };
}

export function buildNutritionProteinVsWeight(
  proteinByDay: Map<string, number>,
  weight: WeightLog[],
  rangeDates?: string[],
): DualTrendView {
  const dates =
    rangeDates ??
    sortedDates(
      proteinByDay,
      new Map(weight.map((w) => [w.date, w.weight_lbs])),
    );

  const labels: string[] = [];
  const protein: (number | null)[] = [];
  const weights = forwardFillWeight(weight, dates);

  for (const date of dates) {
    labels.push(shortDate(date));
    protein.push(mapValue(proteinByDay, date));
  }

  return {
    id: "nutrition-protein-weight",
    title: "Protein vs. Weight",
    subtitle: "Daily protein logged (meals + supplements) overlaid with body weight",
    labels,
    primary: protein,
    secondary: weights,
    primaryLabel: "Protein (g)",
    secondaryLabel: "Weight (lb)",
    primaryAccent: "nutrition",
    secondaryAccent: "recovery",
    emptyHint: "Log meals and body weight to see how intake tracks with the scale.",
  };
}

export function dateRangeFromToday(
  today: string,
  days: number,
): string[] {
  const start = addDays(today, -(days - 1));
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(addDays(start, i));
  }
  return out;
}
