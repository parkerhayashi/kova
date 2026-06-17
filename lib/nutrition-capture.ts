import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import {
  restaurantItemToProfile,
  searchRestaurantCatalog,
} from "@/lib/restaurants";
import { scaleNutrients } from "@/lib/nutrition";
import { getFood, searchFoods } from "@/lib/usda";
import type {
  CaptureAnalysisResult,
  CaptureItem,
  CaptureMatchSource,
  NutrientProfile,
} from "@/types";

export const CAPTURE_MODEL = "claude-sonnet-4-20250514";

const modelNutrientsSchema = z.object({
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number().optional(),
  sugar_g: z.number().optional(),
  sodium_mg: z.number().optional(),
  potassium_mg: z.number().optional(),
  calcium_mg: z.number().optional(),
  iron_mg: z.number().optional(),
  magnesium_mg: z.number().optional(),
  zinc_mg: z.number().optional(),
  vitamin_d_mcg: z.number().optional(),
  vitamin_c_mg: z.number().optional(),
  folate_mcg: z.number().optional(),
  vitamin_b12_mcg: z.number().optional(),
  omega3_g: z.number().optional(),
  cholesterol_mg: z.number().optional(),
  saturated_fat_g: z.number().optional(),
});

const modelItemSchema = z.object({
  name: z.string(),
  portion_g: z.number().min(1),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
  nutrients: modelNutrientsSchema,
});

export const captureResultSchema = z.object({
  meal_name: z.string().nullable().optional(),
  items: z.array(modelItemSchema).min(1).max(20),
});

const refineResultSchema = z.object({
  meal_name: z.string().nullable().optional(),
  items: z.array(modelItemSchema).min(1).max(20),
});

const SYSTEM_PROMPT = `You are a nutrition analyst for a personal health app. Given a meal photo and optional user description, identify distinct food items on the plate.

Rules:
- List each visually distinct food separately (e.g. chicken, rice, broccoli — not one combined entry unless truly inseparable like a smoothie).
- portion_g is your best estimate of the edible portion weight in grams for that item on the plate.
- confidence is 0–1 for how sure you are about identity and portion.
- nutrients are totals for that item at the listed portion_g (not per 100g).
- Include reasonable micronutrient estimates when the foods are identifiable (fiber, sodium, iron, etc.).
- Generic names are fine ("grilled chicken", "white rice") — do not invent brand names.
- If the user description mentions ingredients, portions, or corrections, weight it heavily.
- meal_name is an optional short label for the whole meal (e.g. "Lunch", "Post-workout bowl").`;

export function isCaptureConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function newItemId(): string {
  return crypto.randomUUID();
}

function mergeNutrients(
  estimate: NutrientProfile["nutrients"],
  catalog: NutrientProfile["nutrients"],
): NutrientProfile["nutrients"] {
  const out = { ...estimate };
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key as keyof NutrientProfile["nutrients"]] = value;
    }
  }
  return out;
}

function scaleProfileNutrients(
  profile: NutrientProfile,
  portionG: number,
): NutrientProfile["nutrients"] {
  const factor = portionG / profile.serving_size_g;
  return scaleNutrients(profile.nutrients, factor) as NutrientProfile["nutrients"];
}

async function tryRestaurantMatch(
  name: string,
  portionG: number,
): Promise<{ profile: NutrientProfile; matchSource: CaptureMatchSource } | null> {
  const hits = searchRestaurantCatalog(name, undefined, 5);
  const top = hits[0];
  if (!top) return null;

  const normalized = name.trim().toLowerCase();
  const itemName = top.name.toLowerCase();
  if (
    itemName !== normalized &&
    !itemName.startsWith(normalized) &&
    !normalized.startsWith(itemName.split(" ")[0] ?? "")
  ) {
    return null;
  }

  const profile = restaurantItemToProfile(top);
  const factor = portionG / profile.serving_size_g;
  return {
    profile: {
      ...profile,
      nutrients: scaleNutrients(profile.nutrients, factor) as NutrientProfile["nutrients"],
    },
    matchSource: "restaurant",
  };
}

async function tryUsdaMatch(
  name: string,
  portionG: number,
): Promise<{ profile: NutrientProfile; matchSource: CaptureMatchSource } | null> {
  let hits;
  try {
    hits = await searchFoods(name);
  } catch {
    return null;
  }
  const top = hits[0];
  if (!top) return null;

  const normalized = name.trim().toLowerCase();
  const desc = top.description.toLowerCase();
  if (!desc.includes(normalized.split(" ")[0] ?? "") && !normalized.includes(desc.split(",")[0] ?? "")) {
    return null;
  }

  try {
    const profile = await getFood(top.fdcId);
    return {
      profile: {
        ...profile,
        nutrients: scaleProfileNutrients(profile, portionG),
      },
      matchSource: "usda",
    };
  } catch {
    return null;
  }
}

async function enrichItem(
  raw: z.infer<typeof modelItemSchema>,
): Promise<CaptureItem> {
  const estimate = raw.nutrients as NutrientProfile["nutrients"];

  const restaurant = await tryRestaurantMatch(raw.name, raw.portion_g);
  if (restaurant) {
    return {
      id: newItemId(),
      name: raw.name,
      portion_g: raw.portion_g,
      confidence: raw.confidence,
      matchSource: "restaurant",
      food_id: restaurant.profile.food_id,
      nutrients: mergeNutrients(estimate, restaurant.profile.nutrients),
      notes: raw.notes,
    };
  }

  const usda = await tryUsdaMatch(raw.name, raw.portion_g);
  if (usda) {
    return {
      id: newItemId(),
      name: raw.name,
      portion_g: raw.portion_g,
      confidence: raw.confidence,
      matchSource: "usda",
      food_id: usda.profile.food_id,
      nutrients: mergeNutrients(estimate, usda.profile.nutrients),
      notes: raw.notes,
    };
  }

  return {
    id: newItemId(),
    name: raw.name,
    portion_g: raw.portion_g,
    confidence: raw.confidence,
    matchSource: "estimated",
    nutrients: estimate,
    notes: raw.notes,
  };
}

function preserveIds(
  previous: CaptureItem[],
  enriched: CaptureItem[],
): CaptureItem[] {
  return enriched.map((item, index) => ({
    ...item,
    id: previous[index]?.id ?? item.id,
  }));
}

export async function analyzeMealCapture(input: {
  imageBase64: string;
  mediaType?: string;
  description?: string;
}): Promise<CaptureAnalysisResult> {
  if (!isCaptureConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const userText = [
    "Identify all food items in this meal photo and estimate nutrition for each.",
    input.description?.trim()
      ? `User description: ${input.description.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { object } = await generateObject({
    model: anthropic(CAPTURE_MODEL),
    schema: captureResultSchema,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image",
            image: input.imageBase64,
            mediaType: input.mediaType ?? "image/jpeg",
          },
        ],
      },
    ],
  });

  const items = await Promise.all(object.items.map(enrichItem));
  return {
    meal_name: object.meal_name ?? null,
    items,
  };
}

export async function refineMealCapture(input: {
  items: CaptureItem[];
  fixDescription: string;
}): Promise<CaptureAnalysisResult> {
  if (!isCaptureConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const current = input.items.map((item) => ({
    name: item.name,
    portion_g: item.portion_g,
    confidence: item.confidence,
    notes: item.notes,
    nutrients: item.nutrients,
  }));

  const { object } = await generateObject({
    model: anthropic(CAPTURE_MODEL),
    schema: refineResultSchema,
    system: `${SYSTEM_PROMPT}

You are refining a previous meal analysis. Apply the user's correction text to update item names, portions, add/remove items, or adjust nutrients. Return the full corrected item list.`,
    prompt: `Current items (JSON):
${JSON.stringify(current, null, 2)}

User correction:
${input.fixDescription.trim()}`,
  });

  const enriched = await Promise.all(object.items.map(enrichItem));
  return {
    meal_name: object.meal_name ?? null,
    items: preserveIds(input.items, enriched),
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
