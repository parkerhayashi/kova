"use server";

import { revalidatePath } from "next/cache";
import {
  addSupplement,
  deleteSupplement,
  setSupplementTaken,
  updateSupplement,
} from "@/lib/data/tracking";
import { catalogPresetForName } from "@/lib/supplementCatalog";

function refresh() {
  revalidatePath("/supplements");
  revalidatePath("/");
  revalidatePath("/nutrition");
  revalidatePath("/today");
}

export async function toggleSupplement(
  supplementId: string,
  date: string,
  taken: boolean,
): Promise<void> {
  await setSupplementTaken({ supplementId, date, taken });
  refresh();
}

export async function logSupplementDetail(input: {
  supplementId: string;
  date: string;
  dose_taken: number | null;
  time_taken: string | null;
  notes: string | null;
}): Promise<void> {
  await setSupplementTaken({ ...input, taken: true });
  refresh();
}

export async function createSupplement(input: {
  name: string;
  default_dose: number | null;
  unit: string | null;
  notes: string | null;
  nutrients?: Record<string, number> | null;
}): Promise<void> {
  if (!input.name.trim()) return;
  const preset = catalogPresetForName(input.name.trim());
  await addSupplement({
    ...input,
    name: input.name.trim(),
    nutrients: input.nutrients ?? preset?.nutrients ?? null,
  });
  refresh();
}

export async function editSupplement(
  id: string,
  fields: {
    name?: string;
    default_dose?: number | null;
    unit?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  await updateSupplement(id, fields);
  refresh();
}

export async function archiveSupplement(id: string): Promise<void> {
  await updateSupplement(id, { is_active: false });
  refresh();
}

export async function reorderSupplements(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, i) => updateSupplement(id, { sort_order: i })));
  refresh();
}

export async function removeSupplement(id: string): Promise<void> {
  await deleteSupplement(id);
  refresh();
}
