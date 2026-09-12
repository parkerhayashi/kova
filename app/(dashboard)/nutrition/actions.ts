"use server";

import { revalidatePath } from "next/cache";
import {
  bumpReverseDietNow,
  resetAdaptiveEnergyState as persistAdaptiveReset,
  saveNutritionTargets as persistTargets,
  startReverseDiet as persistStartReverse,
  stopReverseDiet as persistStopReverse,
  addMeal,
  deleteMeal,
} from "@/lib/data/nutrition";
import {
  deleteSavedMeal,
  getSavedMeals,
  saveSavedMeal,
} from "@/lib/data/saved-meals";
import { buildMealRow } from "@/lib/nutrition";
import { sumSavedMealComponents } from "@/lib/saved-meals";
import type { NutrientProfile, ReverseDietState, SavedMeal, SavedMealComponent } from "@/types";

function refresh() {
  revalidatePath("/nutrition");
  revalidatePath("/");
  revalidatePath("/habits");
  revalidatePath("/trends");
}

export async function logMeal(
  profile: NutrientProfile,
  date: string,
  servings: number,
  mealName?: string,
): Promise<void> {
  if (!date) throw new Error("Date is required");
  if (servings <= 0) throw new Error("Servings must be greater than zero");
  const row = buildMealRow(profile, date, servings, mealName);
  await addMeal(row);
  refresh();
}

export async function logMealItems(input: {
  date: string;
  mealName?: string;
  items: NutrientProfile[];
}): Promise<void> {
  const { date, mealName, items } = input;
  if (!date) throw new Error("Date is required");
  if (items.length === 0) throw new Error("Add at least one item");

  for (const profile of items) {
    const row = buildMealRow(profile, date, 1, mealName?.trim() || profile.name);
    await addMeal(row);
  }
  refresh();
}

export async function removeMeal(id: string): Promise<void> {
  if (!id) throw new Error("Meal id is required");
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

export async function resetAdaptiveTdee(): Promise<void> {
  await persistAdaptiveReset();
  refresh();
}

export async function startReverseDietAction(): Promise<ReverseDietState> {
  const state = await persistStartReverse();
  refresh();
  return state;
}

export async function stopReverseDietAction(): Promise<void> {
  await persistStopReverse();
  refresh();
}

export async function bumpReverseDietAction(): Promise<ReverseDietState> {
  const state = await bumpReverseDietNow();
  refresh();
  return state;
}

export async function saveSavedMealAction(input: {
  id?: string;
  name: string;
  components: SavedMealComponent[];
}): Promise<SavedMeal> {
  const saved = await saveSavedMeal(input);
  revalidatePath("/nutrition");
  return saved;
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
