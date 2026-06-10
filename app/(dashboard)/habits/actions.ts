"use server";

import { revalidatePath } from "next/cache";
import {
  addHabit,
  deleteHabit,
  setHabitCompletion,
  updateHabit,
} from "@/lib/data/tracking";
import type { HabitKind } from "@/types";

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function toggleHabit(
  habitId: string,
  date: string,
  completed: boolean,
): Promise<void> {
  await setHabitCompletion(habitId, date, completed);
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
