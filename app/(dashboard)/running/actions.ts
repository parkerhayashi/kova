"use server";

import { revalidatePath } from "next/cache";
import { getBaseNutritionGoals } from "@/lib/data/nutrition";
import {
  addMidRunIntake,
  deleteActualRun,
  deleteCalendarRun,
  deleteMidRunIntake,
  deletePlannedRun,
  saveActualRun,
  saveCalendarRun,
  savePlannedRun,
  saveRace,
  setPlannedRunStatus,
  setRunFuelCarbsPerHour,
  type ActualRunInput,
  type CalendarRunInput,
  type PlannedRunInput,
  type RaceInput,
} from "@/lib/data/running";
import type { LeadTimeStatus } from "@/lib/run-fuel";

function refresh() {
  revalidatePath("/running");
  revalidatePath("/nutrition");
  revalidatePath("/");
}

/** Mode 2 — designate a run for nutrition. Below threshold is stored, changes nothing. */
export async function designateRunAction(
  input: PlannedRunInput,
): Promise<{ qualifies: boolean }> {
  const { qualifies } = await savePlannedRun(input);
  refresh();
  return { qualifies };
}

export async function setPlannedRunStatusAction(
  id: string,
  status: "planned" | "skipped",
): Promise<void> {
  await setPlannedRunStatus(id, status);
  refresh();
}

export async function deletePlannedRunAction(id: string): Promise<void> {
  await deletePlannedRun(id);
  refresh();
}

/** Mode 3 — entering a race in the calendar is its nutrition designation. */
export async function saveRaceAction(input: RaceInput): Promise<{
  status: LeadTimeStatus;
  warning: string | null;
  load_dates: string[];
}> {
  const base = await getBaseNutritionGoals();
  const { load } = await saveRace(input, {
    carbs_g: base.carbs_g,
    fat_g: base.fat_g,
  });
  refresh();
  return { status: load.status, warning: load.warning, load_dates: load.load_dates };
}

export async function saveActualRunAction(input: ActualRunInput): Promise<void> {
  await saveActualRun(input);
  refresh();
}

export async function deleteActualRunAction(id: string): Promise<void> {
  await deleteActualRun(id);
  refresh();
}

export async function addMidRunIntakeAction(input: {
  date: string;
  planned_run_id?: string | null;
  actual_run_id?: string | null;
  label?: string;
  carbs_g?: number;
  kcal?: number;
  taken_at_min?: number | null;
}): Promise<void> {
  await addMidRunIntake(input);
  refresh();
}

export async function deleteMidRunIntakeAction(id: string): Promise<void> {
  await deleteMidRunIntake(id);
  refresh();
}

/** Training-only calendar entry — never changes targets on its own. */
export async function saveCalendarRunAction(input: CalendarRunInput): Promise<void> {
  await saveCalendarRun(input);
  refresh();
}

export async function deleteCalendarRunAction(id: string): Promise<void> {
  await deleteCalendarRun(id);
  refresh();
}

export async function setRunFuelRateAction(rate: number): Promise<number> {
  const value = await setRunFuelCarbsPerHour(rate);
  refresh();
  return value;
}
