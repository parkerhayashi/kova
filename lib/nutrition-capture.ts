import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import type { CaptureAnalysisResult, CaptureItem, NutrientProfile } from "@/types";

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

function normalizeMealName(val: unknown): string | null {
  if (val == null || val === "") return null;
  return String(val).trim() || null;
}

function normalizeNotes(val: unknown): string | undefined {
  if (val == null || val === "") return undefined;
  return String(val);
}

const modelItemSchema = z.object({
  name: z.coerce.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  portion_g: z.coerce.number().transform((n) => Math.max(1, n)),
  confidence: z.preprocess(normalizeConfidence, z.number()),
  notes: z.preprocess(normalizeNotes, z.string().optional()),
  nutrients: modelNutrientsSchema,
});

const captureResultSchema = z.object({
  meal_name: z.preprocess(normalizeMealName, z.string().nullable().optional()),
  items: z.array(modelItemSchema).min(1).max(20),
});

export type NormalizedCaptureItem = z.infer<typeof modelItemSchema>;

const JSON_FORMAT = `Return ONLY a JSON object (no markdown fences) with this shape:
{
  "meal_name": string | null,
  "items": [
    {
      "name": string,
      "portion_g": number,
      "confidence": number,
      "notes": string (optional),
      "nutrients": {
        "calories": number,
        "protein_g": number,
        "carbs_g": number,
        "fat_g": number,
        "fiber_g": number (optional),
        "sodium_mg": number (optional)
      }
    }
  ]
}`;

const SYSTEM_PROMPT = `You are a nutrition analyst for a personal health app. Given a meal photo and optional user description, identify distinct food items on the plate.

Rules:
- List each visually distinct food separately (e.g. chicken, rice, broccoli — not one combined entry unless truly inseparable like a smoothie).
- portion_g is your best estimate of the edible portion weight in grams for that item on the plate.
- confidence is 0–1 (or 0–100) for how sure you are about identity and portion.
- nutrients are totals for that item at the listed portion_g (not per 100g).
- Include reasonable micronutrient estimates when the foods are identifiable (fiber, sodium, iron, etc.).
- Generic names are fine ("grilled chicken", "white rice") — do not invent brand names.
- If the user description mentions ingredients, portions, or corrections, weight it heavily.
- meal_name is an optional short label for the whole meal (e.g. "Lunch", "Post-workout bowl").

${JSON_FORMAT}`;

export function isCaptureConfigured(): boolean {
  return getAnthropicApiKey() !== null;
}

function getAnthropicApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
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
    /did not match|expected pattern|type validation|no object generated|invalid input|expected number|expected string|json|parse/i.test(
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

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function parseCaptureResponse(text: string): CaptureAnalysisResult {
  let payload: unknown;
  try {
    payload = JSON.parse(extractJson(text));
  } catch {
    throw new Error("Model response was not valid JSON");
  }

  const parsed = captureResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid meal analysis shape");
  }

  return {
    meal_name: parsed.data.meal_name ?? null,
    items: parsed.data.items.map(rawToCaptureItem),
  };
}

function newItemId(): string {
  return crypto.randomUUID();
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

function preserveIds(previous: CaptureItem[], next: CaptureItem[]): CaptureItem[] {
  return next.map((item, index) => ({
    ...item,
    id: previous[index]?.id ?? item.id,
  }));
}

async function runCaptureModel(input: {
  system: string;
  userText: string;
  imageBase64?: string;
  mediaType?: string;
}): Promise<CaptureAnalysisResult> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string; mediaType?: string }
  > = [{ type: "text", text: input.userText }];

  if (input.imageBase64) {
    content.push({
      type: "image",
      image: input.imageBase64,
      mediaType: input.mediaType ?? "image/jpeg",
    });
  }

  const { text } = await generateText({
    model: anthropic(CAPTURE_MODEL),
    system: input.system,
    messages: [{ role: "user", content }],
  }).catch((err) => {
    throw new Error(formatCaptureError(err));
  });

  if (!text?.trim()) {
    throw new Error("Model returned an empty response");
  }

  return parseCaptureResponse(text);
}

export async function analyzeMealCapture(input: {
  imageBase64: string;
  mediaType?: string;
  description?: string;
}): Promise<CaptureAnalysisResult> {
  const configError = captureConfigError();
  if (configError) throw new Error(configError);

  const userText = [
    "Identify all food items in this meal photo and estimate nutrition for each.",
    input.description?.trim()
      ? `User description: ${input.description.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return runCaptureModel({
    system: SYSTEM_PROMPT,
    userText,
    imageBase64: input.imageBase64,
    mediaType: input.mediaType,
  });
}

export async function refineMealCapture(input: {
  items: CaptureItem[];
  fixDescription: string;
}): Promise<CaptureAnalysisResult> {
  const configError = captureConfigError();
  if (configError) throw new Error(configError);

  const current = input.items.map((item) => ({
    name: item.name,
    portion_g: item.portion_g,
    confidence: item.confidence,
    notes: item.notes,
    nutrients: item.nutrients,
  }));

  const result = await runCaptureModel({
    system: `${SYSTEM_PROMPT}

You are refining a previous meal analysis. Apply the user's correction text to update item names, portions, add/remove items, or adjust nutrients. Return the full corrected item list.`,
    userText: `Current items (JSON):
${JSON.stringify(current, null, 2)}

User correction:
${input.fixDescription.trim()}`,
  });

  return {
    meal_name: result.meal_name,
    items: preserveIds(input.items, result.items),
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
