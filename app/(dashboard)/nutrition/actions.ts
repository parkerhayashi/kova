"use server";

import { revalidatePath } from "next/cache";
import { addMeal, deleteMeal, saveNutritionTargets as persistTargets } from "@/lib/data/nutrition";
import { buildMealRow } from "@/lib/nutrition";
import type { NutrientProfile } from "@/types";

function refresh() {
  revalidatePath("/nutrition");
  revalidatePath("/today");
}

export async function logMeal(
  profile: NutrientProfile,
  date: string,
  servings: number,
  mealName?: string,
): Promise<void> {
  if (!date || servings <= 0) return;
  const row = buildMealRow(profile, date, servings, mealName);
  await addMeal(row);
  refresh();
}

export async function removeMeal(id: string): Promise<void> {
  if (!id) return;
  await deleteMeal(id);
  refresh();
}

export async function saveNutritionTargets(input: {
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
}): Promise<void> {
  await persistTargets(input);
  refresh();
}
