"use server";

import { revalidatePath } from "next/cache";
import { addMeal, deleteMeal, saveNutritionTargets as persistTargets } from "@/lib/data/nutrition";
import {
  deleteSavedMeal,
  getSavedMeals,
  saveSavedMeal,
} from "@/lib/data/saved-meals";
import { buildMealRow } from "@/lib/nutrition";
import { sumSavedMealComponents } from "@/lib/saved-meals";
import type { NutrientProfile, SavedMealComponent } from "@/types";

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

export async function saveSavedMealAction(input: {
  id?: string;
  name: string;
  components: SavedMealComponent[];
}): Promise<void> {
  await saveSavedMeal(input);
  revalidatePath("/nutrition");
}

export async function deleteSavedMealAction(id: string): Promise<void> {
  if (!id) return;
  await deleteSavedMeal(id);
  revalidatePath("/nutrition");
}

export async function logSavedMealAction(
  savedMealId: string,
  date: string,
): Promise<void> {
  if (!savedMealId || !date) return;
  const meals = await getSavedMeals();
  const saved = meals.find((m) => m.id === savedMealId);
  if (!saved) throw new Error("Saved meal not found");

  const totals = sumSavedMealComponents(saved.components);
  const profile: NutrientProfile = {
    food_id: saved.id,
    source: "saved_meal",
    name: saved.name,
    serving_size_g: 100,
    nutrients: totals,
  };
  const row = buildMealRow(profile, date, 1, saved.name);
  await addMeal(row);
  refresh();
}
