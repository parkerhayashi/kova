"use server";

import { revalidatePath } from "next/cache";
import {
  checkInInjury,
  deleteInjury,
  saveInjury,
  setInjuryStatus,
  type InjuryInput,
} from "@/lib/data/injuries";
import type { InjuryStatus } from "@/types";

function refresh() {
  revalidatePath("/injuries");
  revalidatePath("/performance");
  revalidatePath("/");
}

export async function saveInjuryAction(input: InjuryInput): Promise<void> {
  await saveInjury(input);
  refresh();
}

export async function checkInInjuryAction(input: { injury_id: string; severity: number }): Promise<void> {
  await checkInInjury(input);
  refresh();
}

export async function setInjuryStatusAction(id: string, status: InjuryStatus): Promise<void> {
  await setInjuryStatus(id, status);
  refresh();
}

export async function deleteInjuryAction(id: string): Promise<void> {
  await deleteInjury(id);
  refresh();
}
