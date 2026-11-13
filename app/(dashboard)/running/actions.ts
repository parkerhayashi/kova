"use server";

import { revalidatePath } from "next/cache";
import { syncGarmin, type GarminSyncResult } from "@/lib/data/garmin";
import { getBaseNutritionGoals } from "@/lib/data/nutrition";
import {
  addMidRunIntake,
  deleteActualRun,
  deleteFuelProduct,
  deleteMidRunIntake,
  deletePlannedRun,
  deleteTrainingPlanRun,
  moveTrainingPlanRun,
  saveActualRun,
  savePlannedRun,
  saveFuelProduct,
  saveRace,
  saveTrainingPlanRun,
  setPlannedRunStatus,
  setRunFuelCarbsPerHour,
  type ActualRunInput,
  type PlannedRunInput,
  type PlanRunInput,
  type RaceInput,
} from "@/lib/data/running";
import type { LeadTimeStatus } from "@/lib/run-fuel";
import type { FuelProduct } from "@/types";

function refresh() {
  revalidatePath("/running");
  revalidatePath("/training");
  revalidatePath("/cycling");
  revalidatePath("/nutrition");
  revalidatePath("/");
}

/** A run on the calendar is its nutrition designation. Below threshold is stored, changes nothing. */
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

export async function addMidRunIntakeAction(
  input: Parameters<typeof addMidRunIntake>[0],
): Promise<void> {
  await addMidRunIntake(input);
  refresh();
}

export async function saveFuelProductAction(
  input: Parameters<typeof saveFuelProduct>[0],
): Promise<FuelProduct> {
  const product = await saveFuelProduct(input);
  refresh();
  return product;
}

export async function deleteFuelProductAction(id: string): Promise<void> {
  await deleteFuelProduct(id);
  refresh();
}

export async function deleteMidRunIntakeAction(id: string): Promise<void> {
  await deleteMidRunIntake(id);
  refresh();
}

/** Training plan queue — never changes nutrition on its own. */
export async function saveTrainingPlanRunAction(
  input: PlanRunInput & { id?: string },
): Promise<void> {
  await saveTrainingPlanRun(input);
  revalidatePath("/running");
}

export async function deleteTrainingPlanRunAction(id: string): Promise<void> {
  await deleteTrainingPlanRun(id);
  revalidatePath("/running");
}

export async function moveTrainingPlanRunAction(
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await moveTrainingPlanRun(id, direction);
  revalidatePath("/running");
}

export async function setRunFuelRateAction(rate: number): Promise<number> {
  const value = await setRunFuelCarbsPerHour(rate);
  refresh();
  return value;
}

export async function syncGarminAction(): Promise<GarminSyncResult> {
  const result = await syncGarmin();
  refresh();
  revalidatePath("/settings/connections");
  return result;
}
