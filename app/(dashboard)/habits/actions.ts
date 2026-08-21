"use server";

import { revalidatePath } from "next/cache";
import {
  addHabit,
  deleteHabit,
  setHabitCompletion,
  updateHabit,
} from "@/lib/data/tracking";
import type { HabitKind } from "@/types";
import {
  MAX_DRINKS,
  normalizeDrinkCount,
  serializeDrinkCount,
} from "@/lib/habit-drinks";

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/");
  revalidatePath("/nutrition");
  revalidatePath("/trends");
}

export async function toggleHabit(
  habitId: string,
  date: string,
  completed: boolean,
): Promise<void> {
  await setHabitCompletion(habitId, date, completed);
  refresh();
}

/** Log an exact alcohol drink count (null / 0 clears the day tag). */
export async function setHabitDrinkCount(
  habitId: string,
  date: string,
  drinks: number | null,
): Promise<void> {
  const count =
    drinks == null || drinks <= 0
      ? null
      : normalizeDrinkCount(Math.min(MAX_DRINKS, drinks));
  await setHabitCompletion(
    habitId,
    date,
    count != null,
    serializeDrinkCount(count),
  );
  refresh();
}

export async function createHabit(
  name: string,
  kind: HabitKind = "positive",
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await addHabit(trimmed, kind);
  refresh();
}

export async function renameHabit(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await updateHabit(id, { name: trimmed });
  refresh();
}

export async function archiveHabit(id: string): Promise<void> {
  await updateHabit(id, { is_active: false });
  refresh();
}

export async function removeHabit(id: string): Promise<void> {
  await deleteHabit(id);
  refresh();
}

export async function reorderHabits(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, i) => updateHabit(id, { sort_order: i })));
  refresh();
}
