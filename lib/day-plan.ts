/**
 * Rest-of-day nutrition advisor — given what's left on macros and which
 * meals remain, Claude proposes a macro split and food ideas per meal.
 * When the user mentions Duke Dining (or a hall), ideas are real catalog items.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import {
  listDukeItemsByLocation,
  loadDukeCatalog,
  type DukeDiningItem,
} from "@/lib/duke-dining";
import {
  captureConfigError,
  isCaptureConfigured,
} from "@/lib/nutrition-capture";
import type { DailyTotals } from "@/lib/nutrition";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import type { Meal } from "@/types";

export const DAY_PLAN_MODEL = "claude-sonnet-4-6";

export type DayPlanCatalogItem = {
  id: string;
  name: string;
  location: string;
  servings: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type DayPlanMealAdvice = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ideas: string[];
  notes: string | null;
  /** Real Duke dining picks when the user asked for campus food. */
  catalog_items: DayPlanCatalogItem[];
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
  /** Set when Duke dining catalog was used for suggestions. */
  catalog_source: string | null;
};

const mealAdviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  calories: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  protein_g: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  carbs_g: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  fat_g: z.coerce.number().transform((n) => Math.max(0, Math.round(n))),
  ideas: z
    .array(z.string().trim().min(1).max(160))
    .max(5)
    .optional()
    .default([]),
  item_ids: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        servings: z.coerce.number().transform((n) => {
          if (!Number.isFinite(n) || n <= 0) return 1;
          return Math.round(n * 100) / 100;
        }),
      }),
    )
    .max(12)
    .optional()
    .default([]),
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

type DukePlanContext = {
  label: string;
  locationIds: string[] | null;
  items: DukeDiningItem[];
};

const GENERIC_LOCATION_IDS = new Set([
  "cafe",
  "mcdonald-s",
  "panda-express",
  "panera-bread-company",
  "red-mango",
]);

const DUKE_DINING_HINT =
  /\bduke\s*dining\b|\bduke\s*food\b|\bdining\s*halls?\b|\bwest\s*union\b|\bmarketplace\b|\bcampus\s*dining\b|\bduke\s*hall\b/i;

/**
 * Detect Duke Dining (or a specific hall) from the free-text note.
 * Generic single-word halls like "Cafe" only match when Duke dining is also hinted.
 */
export function resolveDukeDiningFromPrompt(prompt: string): DukePlanContext | null {
  const catalog = loadDukeCatalog();
  const p = prompt.toLowerCase();
  const dukeHinted = DUKE_DINING_HINT.test(prompt);

  const locations = [...catalog.locations].sort(
    (a, b) => b.name.length - a.name.length,
  );

  const matched = locations.filter((loc) => {
    const name = loc.name.toLowerCase();
    const idWords = loc.id.replace(/-/g, " ");
    const hit =
      p.includes(name) ||
      (idWords.length >= 5 && p.includes(idWords)) ||
      (name.includes("&") && p.includes(name.replace(/\s*&\s*/g, " and ")));
    if (!hit) return false;
    if (GENERIC_LOCATION_IDS.has(loc.id) && !dukeHinted) return false;
    // Very short names need an explicit duke hint
    if (name.length < 5 && !dukeHinted) return false;
    return true;
  });

  if (matched.length > 0) {
    const locationIds = matched.map((l) => l.id);
    const items = locationIds.flatMap((id) => listDukeItemsByLocation(id));
    return {
      label: matched.map((l) => l.name).join(", "),
      locationIds,
      items,
    };
  }

  if (!dukeHinted) return null;

  return {
    label: "Duke Dining",
    locationIds: null,
    items: catalog.items,
  };
}

type CatalogRow = {
  id: string;
  name: string;
  location: string;
  category: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving: string;
};

function toRow(item: DukeDiningItem): CatalogRow {
  return {
    id: item.id,
    name: item.name,
    location: item.location,
    category: item.category,
    calories: item.nutrients.calories ?? null,
    protein_g: item.nutrients.protein_g ?? null,
    carbs_g: item.nutrients.carbs_g ?? null,
    fat_g: item.nutrients.fat_g ?? null,
    serving: item.servingSize,
  };
}

/** Prefer protein-dense / named entrees when the full catalog is huge. */
function selectCatalogRows(items: DukeDiningItem[], limit = 240): CatalogRow[] {
  if (items.length <= limit) {
    return items.map(toRow).sort((a, b) => a.name.localeCompare(b.name));
  }

  const scored = items.map((item) => {
    const p = item.nutrients.protein_g ?? 0;
    const cal = item.nutrients.calories ?? 0;
    const density = cal > 0 ? p / cal : p;
    let score = p * 2 + density * 80;
    if (/chicken|beef|fish|salmon|turkey|tofu|egg|bowl|grill|steak/i.test(item.name)) {
      score += 25;
    }
    if (/sauce|dressing|condiment|beverage|soda|coffee|tea|water/i.test(item.name)) {
      score -= 40;
    }
    return { item, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score || a.item.name.localeCompare(b.item.name),
  );

  return scored.slice(0, limit).map((s) => toRow(s.item));
}

function compactCatalog(rows: CatalogRow[]): string {
  return rows
    .map((r) => {
      const cal = r.calories != null ? Math.round(r.calories) : "?";
      const p = r.protein_g != null ? Math.round(r.protein_g) : "?";
      const c = r.carbs_g != null ? Math.round(r.carbs_g) : "?";
      const f = r.fat_g != null ? Math.round(r.fat_g) : "?";
      const cat = r.category ? ` [${r.category}]` : "";
      return `${r.id} | ${r.name} @ ${r.location}${cat} | ${cal}kcal ${p}P/${c}C/${f}F | ${r.serving}`;
    })
    .join("\n");
}

function resolveCatalogItems(
  items: DukeDiningItem[],
  picks: { id: string; servings: number }[],
): DayPlanCatalogItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: DayPlanCatalogItem[] = [];
  for (const pick of picks) {
    const row = byId.get(pick.id);
    if (!row) continue;
    const servings = pick.servings;
    const scale = (n: number | null | undefined) =>
      n == null ? null : Math.round(n * servings * 10) / 10;
    out.push({
      id: row.id,
      name: row.name,
      location: row.location,
      servings,
      calories: scale(row.nutrients.calories),
      protein_g: scale(row.nutrients.protein_g),
      carbs_g: scale(row.nutrients.carbs_g),
      fat_g: scale(row.nutrients.fat_g),
    });
  }
  return out;
}

function formatCatalogIdea(item: DayPlanCatalogItem): string {
  const macros: string[] = [];
  if (item.calories != null) macros.push(`${Math.round(item.calories)} kcal`);
  if (item.protein_g != null) macros.push(`${Math.round(item.protein_g)}P`);
  const serving =
    item.servings !== 1 ? ` ×${item.servings}` : "";
  const macroStr = macros.length ? ` — ${macros.join(", ")}` : "";
  return `${item.name}${serving} · ${item.location}${macroStr}`;
}

function buildSystemPrompt(hasDukeCatalog: boolean): string {
  const catalogRules = hasDukeCatalog
    ? `
Duke Dining catalog is provided. For any meal the user plans at Duke Dining / a named hall:
- Prefer item_ids from the catalog (real menu lines only — never invent ids).
- ideas may be short notes; catalog picks will be shown with real macros.
- Nutrients for catalog items are already known — do not invent numbers for those lines.
- Meal macro targets should still allocate remaining budget across meals.
- If a meal is NOT at Duke (e.g. home snack), use free-text ideas and leave item_ids empty.
`
    : `
Food ideas should be ordinary grocery / campus / restaurant foods — not branded recipes requiring a kitchen lab.
Keep ideas short (e.g. "Greek yogurt + banana", "chicken bowl, light rice, extra salsa").
`;

  return `You are a practical nutrition coach for one user's personal health app (Kova).

You receive structured JSON: today's goals, intake so far, remaining macros, logged meals, and a free-text note about meals still left (e.g. pre-workout snack + dinner).

Your job: allocate the REMAINING macros across those upcoming meals and suggest realistic food ideas.
${catalogRules}
Rules:
- Never invent today's logged numbers — use the provided remaining macros as the budget.
- Meal calorie/protein/carb/fat targets should roughly sum to remaining (within ~10% is fine; prefer slightly under if tight).
- If remaining calories are very low, be honest: prioritize protein, shrink carbs/fat, suggest lighter options.
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
      "item_ids": [{ "id": string, "servings": number }],
      "notes": string | null
    }
  ]
}`;
}

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
  const duke = resolveDukeDiningFromPrompt(prompt);
  const catalogRows = duke ? selectCatalogRows(duke.items) : [];

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
    duke_dining: duke
      ? {
          label: duke.label,
          location_filter: duke.locationIds,
          item_count_in_prompt: catalogRows.length,
        }
      : null,
  };

  const catalogBlock =
    duke && catalogRows.length > 0
      ? `\n\nDuke Dining menu catalog for "${duke.label}" (id | name @ location | macros | serving):\n${compactCatalog(catalogRows)}`
      : "";

  const { text } = await generateText({
    model: anthropic(DAY_PLAN_MODEL),
    system: buildSystemPrompt(Boolean(duke && catalogRows.length)),
    messages: [
      {
        role: "user",
        content: `Plan the rest of my nutrition day.\n\nContext JSON:\n${JSON.stringify(context, null, 2)}${catalogBlock}`,
      },
    ],
  }).catch((err) => {
    throw new Error(err instanceof Error ? err.message : "Day plan failed");
  });

  if (!text?.trim()) throw new Error("Model returned an empty response");

  const parsed = adviceSchema.parse(extractJson(text));
  const dukeItems = duke?.items ?? [];

  return {
    headline: parsed.headline,
    summary: parsed.summary,
    meals: parsed.meals.map((m) => {
      const catalog_items = resolveCatalogItems(dukeItems, m.item_ids);
      const ideas =
        catalog_items.length > 0
          ? catalog_items.map(formatCatalogIdea)
          : m.ideas.length > 0
            ? m.ideas
            : ["No specific foods suggested — hit the macro targets above."];

      // If model also sent free-text ideas alongside catalog, append unique ones
      if (catalog_items.length > 0 && m.ideas.length > 0) {
        for (const idea of m.ideas) {
          if (!ideas.includes(idea)) ideas.push(idea);
        }
      }

      return {
        name: m.name,
        calories: m.calories,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
        ideas: ideas.slice(0, 8),
        notes: m.notes ?? null,
        catalog_items,
      };
    }),
    remaining,
    catalog_source: duke?.label ?? null,
  };
}
