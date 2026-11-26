"use server";

import { revalidatePath } from "next/cache";
import {
  createPlan,
  resolveSuggestion,
  setWorkoutSkipped,
  type CreatePlanInput,
} from "@/lib/data/plan";

function refresh() {
  revalidatePath("/training");
  revalidatePath("/running");
  revalidatePath("/nutrition");
  revalidatePath("/");
}

export async function createPlanAction(input: CreatePlanInput): Promise<void> {
  await createPlan(input);
  refresh();
}

export async function setWorkoutSkippedAction(id: string, skipped: boolean): Promise<void> {
  await setWorkoutSkipped(id, skipped);
  refresh();
}

export async function resolveSuggestionAction(id: string, accept: boolean): Promise<void> {
  await resolveSuggestion(id, accept);
  refresh();
}
