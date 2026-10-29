"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  bumpReverseDietNow,
  clearAdaptiveEnergyState as persistAdaptiveClear,
  resetAdaptiveEnergyState as persistAdaptiveReset,
  saveNutritionTargets as persistTargets,
  setManualAdaptiveEnergyState as persistManualNudge,
  startDietBreak as persistStartDietBreak,
  startReverseDiet as persistStartReverse,
  stopDietBreak as persistStopDietBreak,
  stopReverseDiet as persistStopReverse,
  addMeal,
  addMeals,
  deleteMeal,
  deleteMealGroup,
} from "@/lib/data/nutrition";
import { setAlcoholDrinks } from "@/lib/data/alcohol";
import {
  deleteSavedMeal,
  getSavedMeals,
  saveSavedMeal,
} from "@/lib/data/saved-meals";
import { buildMealRow } from "@/lib/nutrition";
import type { DietBreakDurationDays } from "@/lib/diet-break";
import type {
  DietBreakState,
  NutrientProfile,
  ReverseDietState,
  SavedMeal,
  SavedMealComponent,
} from "@/types";

function refresh() {
  revalidatePath("/nutrition");
  revalidatePath("/");
  revalidatePath("/trends");
}

/** Log the day's standard drinks (null / 0 clears it). */
export async function setAlcoholDrinksAction(
  date: string,
  drinks: number | null,
): Promise<void> {
  if (!date) throw new Error("Date is required");
  await setAlcoholDrinks(date, drinks);
  refresh();
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

  // Each item keeps its own name and macros; a multi-item (or named) meal
  // groups them so the log can expand it and drop single ingredients.
  const name = mealName?.trim();
  const group =
    items.length > 1 || name
      ? { id: randomUUID(), name: name || "Captured meal" }
      : undefined;
  await addMeals(items.map((profile) => buildMealRow(profile, date, 1, profile.name, group)));
  refresh();
}

export async function removeMeal(id: string): Promise<void> {
  if (!id) throw new Error("Meal id is required");
  await deleteMeal(id);
  refresh();
}

/** Delete a whole logged meal (all of its ingredient rows). */
export async function removeMealGroup(groupId: string): Promise<void> {
  if (!groupId) throw new Error("Meal group id is required");
  await deleteMealGroup(groupId);
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

export async function returnTdeeNudgeToAuto(): Promise<void> {
  await persistAdaptiveClear();
  refresh();
}

export async function setManualTdeeNudge(adjustment: number): Promise<number> {
  const value = await persistManualNudge(adjustment);
  refresh();
  return value;
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

export async function startDietBreakAction(
  durationDays: DietBreakDurationDays = null,
): Promise<DietBreakState> {
  const state = await persistStartDietBreak(durationDays);
  refresh();
  return state;
}

export async function stopDietBreakAction(): Promise<void> {
  await persistStopDietBreak();
  refresh();
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

  // One row per ingredient (same totals as before), grouped under the meal.
  if (saved.components.length === 0) throw new Error("Saved meal has no items");
  const group = { id: randomUUID(), name: saved.name };
  await addMeals(
    saved.components.map((component) =>
      buildMealRow(
        {
          food_id: component.food_id ?? saved.id,
          source: component.source ?? "saved_meal",
          name: component.name,
          serving_size_g: component.serving_size_g ?? 100,
          nutrients: component.nutrients,
        },
        date,
        component.servings,
        component.name,
        group,
      ),
    ),
  );
  refresh();
}
