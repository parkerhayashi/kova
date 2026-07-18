/**
 * Meal Maker — pick a Duke dining hall or saved restaurant, state macro/food
 * targets, and Claude proposes a meal from that place's catalog only.
 * Nutrients always come from catalog rows, never from the model.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import {
  dukeItemToProfile,
  listDukeItemsByLocation,
  loadDukeCatalog,
  type DukeDiningItem,
} from "@/lib/duke-dining";
import {
  captureConfigError,
  isCaptureConfigured,
} from "@/lib/nutrition-capture";
import {
  listRestaurantItems,
  loadRestaurantCatalog,
  restaurantItemToProfile,
  type RestaurantItem,
} from "@/lib/restaurants";
import { profileToComponent, sumSavedMealComponents } from "@/lib/saved-meals";
import type { SavedMeal, SavedMealComponent } from "@/types";

export const MEAL_MAKER_MODEL = "claude-sonnet-4-6";

export type MealMakerPlaceKind = "duke" | "restaurant";

export type MealMakerPlace = {
  kind: MealMakerPlaceKind;
  id: string;
  name: string;
  itemCount: number;
};

export type MealMakerTargets = {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  notes?: string | null;
};

export type MealMakerProposal = {
  meal_name: string;
  mode: "preset" | "custom";
  rationale: string;
  components: SavedMealComponent[];
  totals: ReturnType<typeof sumSavedMealComponents>;
  unmatched_ids: string[];
};

type CatalogRow = {
  id: string;
  name: string;
  category: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving: string;
};

const proposalSchema = z.object({
  meal_name: z.string().trim().min(1).max(120),
  mode: z.enum(["preset", "custom"]),
  rationale: z.string().trim().max(600).optional().default(""),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        servings: z.coerce.number().transform((n) => {
          if (!Number.isFinite(n) || n <= 0) return 1;
          return Math.round(n * 100) / 100;
        }),
      }),
    )
    .min(1)
    .max(24),
});

export function mealMakerConfigError(): string | null {
  return captureConfigError()?.replace("Meal capture", "Meal maker") ?? null;
}

export function isMealMakerConfigured(): boolean {
  return isCaptureConfigured();
}

export function listMealMakerPlaces(): MealMakerPlace[] {
  const duke = loadDukeCatalog().locations.map((loc) => ({
    kind: "duke" as const,
    id: loc.id,
    name: `Duke · ${loc.name}`,
    itemCount: loc.itemCount,
  }));
  const restaurants = loadRestaurantCatalog().restaurants.map((r) => ({
    kind: "restaurant" as const,
    id: r.id,
    name: r.name,
    itemCount: r.itemCount,
  }));
  return [...restaurants, ...duke].sort((a, b) => a.name.localeCompare(b.name));
}

function toCatalogRow(
  item: DukeDiningItem | RestaurantItem,
): CatalogRow {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    calories: item.nutrients.calories ?? null,
    protein_g: item.nutrients.protein_g ?? null,
    carbs_g: item.nutrients.carbs_g ?? null,
    fat_g: item.nutrients.fat_g ?? null,
    serving: item.servingSize,
  };
}

function loadPlaceItems(
  kind: MealMakerPlaceKind,
  placeId: string,
): { placeName: string; rows: CatalogRow[] } {
  if (kind === "duke") {
    const loc = loadDukeCatalog().locations.find((l) => l.id === placeId);
    if (!loc) throw new Error("Unknown Duke dining location");
    const items = listDukeItemsByLocation(placeId);
    return {
      placeName: loc.name,
      rows: items.map(toCatalogRow),
    };
  }

  const restaurant = loadRestaurantCatalog().restaurants.find(
    (r) => r.id === placeId,
  );
  if (!restaurant) throw new Error("Unknown restaurant");
  const items = listRestaurantItems(placeId);
  return {
    placeName: restaurant.name,
    rows: items.map(toCatalogRow),
  };
}

function compactCatalog(rows: CatalogRow[], limit = 220): string {
  const slice = rows.length <= limit ? rows : rows.slice(0, limit);
  const lines = slice.map((r) => {
    const cal = r.calories != null ? Math.round(r.calories) : "?";
    const p = r.protein_g != null ? Math.round(r.protein_g) : "?";
    const c = r.carbs_g != null ? Math.round(r.carbs_g) : "?";
    const f = r.fat_g != null ? Math.round(r.fat_g) : "?";
    const cat = r.category ? ` [${r.category}]` : "";
    return `${r.id} | ${r.name}${cat} | ${cal}kcal ${p}P/${c}C/${f}F | ${r.serving}`;
  });
  const truncated =
    rows.length > limit
      ? `\n… truncated ${rows.length - limit} more items (prefer ids above)`
      : "";
  return lines.join("\n") + truncated;
}

function savedMealsForPlace(
  kind: MealMakerPlaceKind,
  placeId: string,
  saved: SavedMeal[],
): { name: string; items: { id: string; servings: number }[] }[] {
  const out: { name: string; items: { id: string; servings: number }[] }[] = [];
  for (const meal of saved) {
    const items = meal.components
      .filter((c) => {
        if (!c.food_id) return false;
        if (kind === "restaurant") {
          return (
            c.source === "restaurant" &&
            (c.food_id.startsWith(`${placeId}:`) ||
              c.food_id.includes(`:${placeId}:`))
          );
        }
        return (
          c.source === "duke_dining" &&
          (c.food_id.includes(`:${placeId}:`) ||
            c.food_id.startsWith(`duke:${placeId}:`))
        );
      })
      .map((c) => ({ id: c.food_id!, servings: c.servings }));
    if (items.length === 0) continue;
    // Only keep presets that are fully from this place
    if (items.length < meal.components.filter((c) => c.food_id).length) continue;
    out.push({ name: meal.name, items });
  }
  return out.slice(0, 12);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]!.trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

function resolveComponents(
  kind: MealMakerPlaceKind,
  placeId: string,
  items: { id: string; servings: number }[],
): { components: SavedMealComponent[]; unmatched_ids: string[] } {
  const components: SavedMealComponent[] = [];
  const unmatched_ids: string[] = [];
  const catalog =
    kind === "duke"
      ? listDukeItemsByLocation(placeId)
      : listRestaurantItems(placeId);
  const byId = new Map(catalog.map((row) => [row.id, row]));

  for (const item of items) {
    const row = byId.get(item.id);
    if (!row) {
      unmatched_ids.push(item.id);
      continue;
    }
    const profile =
      kind === "duke"
        ? dukeItemToProfile(row as DukeDiningItem)
        : restaurantItemToProfile(row as RestaurantItem);
    components.push(profileToComponent(profile, item.servings));
  }

  return { components, unmatched_ids };
}

function formatTargets(targets: MealMakerTargets): string {
  const parts: string[] = [];
  if (targets.calories != null && targets.calories > 0) {
    parts.push(`calories ≈ ${Math.round(targets.calories)} kcal`);
  }
  if (targets.protein_g != null && targets.protein_g > 0) {
    parts.push(`protein ≈ ${Math.round(targets.protein_g)} g`);
  }
  if (targets.carbs_g != null && targets.carbs_g > 0) {
    parts.push(`carbs ≈ ${Math.round(targets.carbs_g)} g`);
  }
  if (targets.fat_g != null && targets.fat_g > 0) {
    parts.push(`fat ≈ ${Math.round(targets.fat_g)} g`);
  }
  if (targets.notes?.trim()) {
    parts.push(`preferences: ${targets.notes.trim()}`);
  }
  return parts.length ? parts.join("\n") : "No numeric targets — build a sensible balanced meal.";
}

export async function generateMealMakerProposal(input: {
  kind: MealMakerPlaceKind;
  placeId: string;
  targets: MealMakerTargets;
  savedMeals?: SavedMeal[];
}): Promise<MealMakerProposal> {
  const configError = mealMakerConfigError();
  if (configError) throw new Error(configError);

  const { placeName, rows } = loadPlaceItems(input.kind, input.placeId);
  if (rows.length === 0) {
    throw new Error("No menu items found for that place");
  }

  const presets = savedMealsForPlace(
    input.kind,
    input.placeId,
    input.savedMeals ?? [],
  );

  const system = `You are a nutrition meal builder for Kova.
You MUST only use menu item ids from the provided catalog for the chosen place.
Never invent ids or nutrient numbers. Nutrients are already known for each id.

Decide:
- "preset" if an existing saved meal for this place already fits the targets (reuse its item ids), OR if the place sells curated/ready bowls you should pick as whole items.
- "custom" if this is a build-your-own / ingredient place (Chipotle-style, Cava bases+toppings, etc.) — compose a meal from ingredients with servings (often 1, sometimes 0.5 or 2).

Rules:
- Prefer high protein when a protein target is set.
- Stay near calorie/macro targets when given (±10% is fine).
- Keep the meal realistic to order (one base, protein, toppings, sauce — not 15 random sides).
- servings are multiples of catalog servings (1 = one standard serving of that line).
- Return ONLY JSON (no markdown) with shape:
{
  "meal_name": string,
  "mode": "preset" | "custom",
  "rationale": string,
  "items": [{ "id": string, "servings": number }]
}`;

  const userText = `Place: ${placeName} (${input.kind})
Targets:
${formatTargets(input.targets)}

Existing saved meals for this place (optional presets):
${presets.length ? JSON.stringify(presets, null, 2) : "none"}

Menu catalog (id | name [category] | macros | serving):
${compactCatalog(rows)}
`;

  const { text } = await generateText({
    model: anthropic(MEAL_MAKER_MODEL),
    system,
    messages: [{ role: "user", content: userText }],
  }).catch((err) => {
    const message = err instanceof Error ? err.message : "Meal maker failed";
    throw new Error(message);
  });

  if (!text?.trim()) throw new Error("Model returned an empty response");

  const parsed = proposalSchema.parse(extractJson(text));
  const { components, unmatched_ids } = resolveComponents(
    input.kind,
    input.placeId,
    parsed.items,
  );

  if (components.length === 0) {
    throw new Error(
      "Model returned items that are not on this menu. Try again.",
    );
  }

  return {
    meal_name: parsed.meal_name,
    mode: parsed.mode,
    rationale: parsed.rationale,
    components,
    totals: sumSavedMealComponents(components),
    unmatched_ids,
  };
}
