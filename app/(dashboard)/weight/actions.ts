"use server";

import { revalidatePath } from "next/cache";
import { deleteWeight, upsertWeight } from "@/lib/data/tracking";

export async function saveWeight(input: {
  date: string;
  weight_lbs: number;
  body_fat_pct: number | null;
  notes: string | null;
}): Promise<void> {
  await upsertWeight(input);
  revalidatePath("/weight");
  revalidatePath("/");
}

export async function removeWeight(date: string): Promise<void> {
  await deleteWeight(date);
  revalidatePath("/weight");
  revalidatePath("/");
}
