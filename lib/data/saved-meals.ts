import { createServiceClient } from "@/lib/supabase/server";
import type { SavedMeal, SavedMealComponent } from "@/types";

export async function getSavedMeals(): Promise<SavedMeal[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("saved_meals")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return ((data ?? []) as SavedMeal[]).map(normalizeSavedMeal);
}

export async function saveSavedMeal(input: {
  id?: string;
  name: string;
  components: SavedMealComponent[];
}): Promise<SavedMeal> {
  const db = createServiceClient();
  const name = input.name.trim();
  if (!name) throw new Error("Meal name is required");
  if (input.components.length === 0) throw new Error("Add at least one item");

  if (input.id) {
    const { data, error } = await db
      .from("saved_meals")
      .update({ name, components: input.components })
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return normalizeSavedMeal(data as SavedMeal);
  }

  const { data: maxRow } = await db
    .from("saved_meals")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from("saved_meals")
    .insert({
      name,
      components: input.components,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalizeSavedMeal(data as SavedMeal);
}

export async function deleteSavedMeal(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("saved_meals").delete().eq("id", id);
}

function normalizeSavedMeal(row: SavedMeal): SavedMeal {
  return {
    ...row,
    components: Array.isArray(row.components) ? row.components : [],
  };
}
