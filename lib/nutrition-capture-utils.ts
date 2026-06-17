import type { CaptureItem, NutrientProfile } from "@/types";

export function captureItemToProfile(item: CaptureItem): NutrientProfile {
  let source: NutrientProfile["source"] = "photo_estimate";
  let food_id = item.food_id ?? `capture-${item.id}`;

  if (item.matchSource === "usda" && item.food_id) {
    source = "usda";
    food_id = item.food_id;
  } else if (item.matchSource === "restaurant" && item.food_id) {
    source = "restaurant";
    food_id = item.food_id;
  }

  return {
    food_id,
    source,
    name: item.name,
    serving_size_g: item.portion_g,
    nutrients: item.nutrients,
  };
}

export function sumCaptureTotals(items: CaptureItem[]): NutrientProfile["nutrients"] {
  const totals: NutrientProfile["nutrients"] = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item.nutrients)) {
      if (typeof value !== "number") continue;
      const k = key as keyof NutrientProfile["nutrients"];
      totals[k] = Math.round(((totals[k] ?? 0) + value) * 10) / 10;
    }
  }
  return totals;
}
