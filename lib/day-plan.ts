/**
 * Rest-of-day nutrition advisor — given what's left on macros and which
 * meals remain, Claude proposes a macro split and food ideas per meal.
 * Uses the same ANTHROPIC_API_KEY as meal capture / meal maker.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import {
  captureConfigError,
  isCaptureConfigured,
} from "@/lib/nutrition-capture";
import type { DailyTotals } from "@/lib/nutrition";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import type { Meal } from "@/types";

export const DAY_PLAN_MODEL = "claude-sonnet-4-6";

export type DayPlanMealAdvice = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ideas: string[];
  notes: string | null;
};

export type DayPlanAdvice = {
  headline: string;
  summary: string;
  meals: DayPlanMealAdvice[];
  remaining: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
};

const mealAdviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  calories: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  protein_g: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  carbs_g: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  fat_g: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  ideas: z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(5)
    .transform((arr) => arr.slice(0, 5)),
  notes: z
    .preprocess(
      (v) => (v == null || v === "" ? null : String(v).trim()),
      z.string().max(240).nullable(),
    )
    .optional()
    .default(null),
});

const adviceSchema = z.object({
  headline: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(1).max(500),
  meals: z.array(mealAdviceSchema).min(1).max(6),
});

export function dayPlanConfigError(): string | null {
  return captureConfigError()?.replace("Meal capture", "Day plan") ?? null;
}

export function isDayPlanConfigured(): boolean {
  return isCaptureConfigured();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function remainingMacros(
  goals: ComputedNutritionGoals,
  totals: DailyTotals,
): DayPlanAdvice["remaining"] {
  return {
    calories: Math.max(0, Math.round(goals.calories - (totals.calories ?? 0))),
    protein_g: Math.max(0, Math.round(goals.protein_g - (totals.protein_g ?? 0))),
    carbs_g: Math.max(0, Math.round(goals.carbs_g - (totals.carbs_g ?? 0))),
    fat_g: Math.max(0, Math.round(goals.fat_g - (totals.fat_g ?? 0))),
  };
}

function mealBrief(meals: Meal[]): { name: string; calories: number; protein_g: number }[] {
  return meals.map((m) => ({
    name: m.meal_name?.trim() || "Logged item",
    calories: Math.round(m.calories ?? 0),
    protein_g: Math.round(m.protein_g ?? 0),
  }));
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

const SYSTEM_PROMPT = `You are a practical nutrition coach for one user's personal health app (Kova).

You receive structured JSON: today's goals, intake so far, remaining macros, logged meals, and a free-text note about meals still left (e.g. pre-workout snack + dinner).

Your job: allocate the REMAINING macros across those upcoming meals and suggest realistic food ideas.

Rules:
- Never invent today's logged numbers — use the provided remaining macros as the budget.
- Meal calorie/protein/carb/fat targets should roughly sum to remaining (within ~10% is fine; prefer slightly under if tight).
- If remaining calories are very low, be honest: prioritize protein, shrink carbs/fat, suggest lighter options.
- Food ideas should be ordinary grocery / campus / restaurant foods — not branded recipes requiring a kitchen lab.
- Keep ideas short (e.g. "Greek yogurt + banana", "chicken bowl, light rice, extra salsa").
- No medical advice. Be direct.
- Match the meal names to what the user said they still need when possible.

Return ONLY JSON:
{
  "headline": string,
  "summary": string,
  "meals": [
    {
      "name": string,
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "ideas": string[],
      "notes": string | null
    }
  ]
}`;

export async function generateDayPlan(input: {
  prompt: string;
  totals: DailyTotals;
  goals: ComputedNutritionGoals;
  meals: Meal[];
}): Promise<DayPlanAdvice> {
  const configError = dayPlanConfigError();
  if (configError) throw new Error(configError);

  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Say what meals you still need today.");

  const remaining = remainingMacros(input.goals, input.totals);
  const logged = mealBrief(input.meals);

  const context = {
    goals: {
      calories: input.goals.calories,
      protein_g: input.goals.protein_g,
      carbs_g: input.goals.carbs_g,
      fat_g: input.goals.fat_g,
    },
    eaten: {
      calories: Math.round(input.totals.calories ?? 0),
      protein_g: round1(input.totals.protein_g ?? 0),
      carbs_g: round1(input.totals.carbs_g ?? 0),
      fat_g: round1(input.totals.fat_g ?? 0),
    },
    remaining,
    logged_meals: logged,
    user_note: prompt,
    weight_goal_lbs: input.goals.meta.weight_goal_lbs,
    current_weight_lbs: input.goals.meta.current_weight_lbs,
  };

  const { text } = await generateText({
    model: anthropic(DAY_PLAN_MODEL),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Plan the rest of my nutrition day.\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Day plan failed");
  });

  if (!text?.trim()) throw new Error("Model returned an empty response");

  const parsed = adviceSchema.parse(extractJson(text));
  return {
    headline: parsed.headline,
    summary: parsed.summary,
    meals: parsed.meals.map((m) => ({
      name: m.name,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      ideas: m.ideas,
      notes: m.notes ?? null,
    })),
    remaining,
  };
}
