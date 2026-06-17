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

export const CAPTURE_MODEL = "claude-sonnet-4-6";

const optionalNutrient = z.coerce.number().optional();

const modelNutrientsSchema = z
  .object({
    calories: z.coerce.number(),
    protein_g: z.coerce.number(),
    carbs_g: z.coerce.number(),
    fat_g: z.coerce.number(),
    fiber_g: optionalNutrient,
    sugar_g: optionalNutrient,
    sodium_mg: optionalNutrient,
    potassium_mg: optionalNutrient,
    calcium_mg: optionalNutrient,
    iron_mg: optionalNutrient,
    magnesium_mg: optionalNutrient,
    zinc_mg: optionalNutrient,
    vitamin_d_mcg: optionalNutrient,
    vitamin_c_mg: optionalNutrient,
    folate_mcg: optionalNutrient,
    vitamin_b12_mcg: optionalNutrient,
    omega3_g: optionalNutrient,
    cholesterol_mg: optionalNutrient,
    saturated_fat_g: optionalNutrient,
  })
  .passthrough();

function normalizeConfidence(val: unknown): number {
  const n =
    typeof val === "string"
      ? parseFloat(val)
      : typeof val === "number"
        ? val
        : 0.5;
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1 && n <= 100) return n / 100;
  return Math.max(0, Math.min(1, n));
}

function normalizeMealName(val: unknown): string | null | undefined {
  if (val == null || val === "") return null;
  return String(val);
}

function normalizeNotes(val: unknown): string | undefined {
  if (val == null || val === "") return undefined;
  return String(val);
}

const modelItemSchema = z.object({
  name: z.coerce.string().min(1),
  portion_g: z.coerce.number().positive(),
  confidence: z.preprocess(normalizeConfidence, z.number().min(0).max(1)),
  notes: z.preprocess(normalizeNotes, z.string().optional()),
  nutrients: modelNutrientsSchema,
});

export const captureResultSchema = z.object({
  meal_name: z.preprocess(normalizeMealName, z.string().nullable().optional()),
  items: z.array(modelItemSchema).min(1).max(20),
});

const refineResultSchema = captureResultSchema;

export type NormalizedCaptureItem = z.infer<typeof modelItemSchema>;

const SYSTEM_PROMPT = `You are a nutrition analyst for a personal health app. Given a meal photo and optional user description, identify distinct food items on the plate.

Rules:
- List each visually distinct food separately (e.g. chicken, rice, broccoli — not one combined entry unless truly inseparable like a smoothie).
- portion_g is your best estimate of the edible portion weight in grams for that item on the plate.
- confidence is 0–1 (or 0–100) for how sure you are about identity and portion.
- nutrients are totals for that item at the listed portion_g (not per 100g).
- Include reasonable micronutrient estimates when the foods are identifiable (fiber, sodium, iron, etc.).
- Generic names are fine ("grilled chicken", "white rice") — do not invent brand names.
- If the user description mentions ingredients, portions, or corrections, weight it heavily.
- meal_name is an optional short label for the whole meal (e.g. "Lunch", "Post-workout bowl").`;

export function isCaptureConfigured(): boolean {
  return getAnthropicApiKey() !== null;
}

function getAnthropicApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  // Anthropic keys start with sk-ant-; reject placeholders / truncated values.
  if (!key.startsWith("sk-ant-") || key.length < 30) return null;
  return key;
}

export function captureConfigError(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return "Meal capture is not configured — add ANTHROPIC_API_KEY to Vercel and .env.local.";
  }
  if (!key.startsWith("sk-ant-") || key.length < 30) {
    return "ANTHROPIC_API_KEY looks invalid — paste a full sk-ant-… key from console.anthropic.com.";
  }
  return null;
}

function formatCaptureError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Capture failed";
  const cause =
    err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const combined = `${message} ${cause}`.trim();

  if (/api-key|authentication|401|403|x-api-key/i.test(combined)) {
    return "Anthropic API key rejected — update ANTHROPIC_API_KEY in Vercel (Production) and redeploy.";
  }
  if (/model.*not found|404|retired|deprecated|does not exist/i.test(combined)) {
    return "Vision model unavailable — the server model ID may need updating.";
  }
  if (
    /did not match schema|type validation|no object generated|invalid input|expected number|expected string/i.test(
      combined,
    )
  ) {
    return "Could not parse the meal analysis — try again with a clearer photo or a short description.";
  }
  if (/timeout|timed out|504/i.test(combined)) {
    return "Analysis timed out — try a smaller photo or add a text description of the meal.";
  }
  return message.length > 160 ? "Meal analysis failed — please try again." : message;
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
  raw: NormalizedCaptureItem,
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

function rawToCaptureItem(raw: NormalizedCaptureItem): CaptureItem {
  return {
    id: newItemId(),
    name: raw.name,
    portion_g: raw.portion_g,
    confidence: raw.confidence,
    matchSource: "estimated",
    nutrients: raw.nutrients as NutrientProfile["nutrients"],
    notes: raw.notes,
  };
}

/** Best-effort catalog match; returns the estimate if lookup is slow. */
async function enrichItemQuick(raw: NormalizedCaptureItem): Promise<CaptureItem> {
  const fallback = rawToCaptureItem(raw);
  try {
    return await Promise.race([
      enrichItem(raw),
      new Promise<CaptureItem>((resolve) => {
        setTimeout(() => resolve(fallback), 1500);
      }),
    ]);
  } catch {
    return fallback;
  }
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
  const configError = captureConfigError();
  if (configError) {
    throw new Error(configError);
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
  }).catch((err) => {
    throw new Error(formatCaptureError(err));
  });

  const items = await Promise.all(object.items.map(enrichItemQuick));
  return {
    meal_name: object.meal_name ?? null,
    items,
  };
}

export async function refineMealCapture(input: {
  items: CaptureItem[];
  fixDescription: string;
}): Promise<CaptureAnalysisResult> {
  const configError = captureConfigError();
  if (configError) {
    throw new Error(configError);
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
  }).catch((err) => {
    throw new Error(formatCaptureError(err));
  });

  const enriched = await Promise.all(object.items.map(enrichItemQuick));
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
