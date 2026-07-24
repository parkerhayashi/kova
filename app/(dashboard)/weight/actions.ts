"use server";

import { revalidatePath } from "next/cache";
import {
  clearVisualBodyFatBaseline,
  saveVisualBodyFatBaseline,
} from "@/lib/data/body-fat";
import type { VisualBodyFatAnswers, VisualBodyFatState } from "@/types";

export async function saveBodyFatEyeTestAction(input: {
  answers: VisualBodyFatAnswers;
  sex: VisualBodyFatState["sex"];
}): Promise<VisualBodyFatState> {
  const state = await saveVisualBodyFatBaseline(input);
  revalidatePath("/weight");
  revalidatePath("/nutrition");
  revalidatePath("/");
  return state;
}

export async function retakeBodyFatEyeTestAction(): Promise<void> {
  await clearVisualBodyFatBaseline();
  revalidatePath("/weight");
}
