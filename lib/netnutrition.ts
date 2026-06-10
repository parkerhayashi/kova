/**
 * CBORD NetNutrition label HTML → Kova NutrientProfile fields.
 * Used by the Duke dining catalog sync and search API.
 */

import type { NutrientProfile } from "@/types";

export interface ParsedNetNutritionItem {
  name: string;
  servingSize: string;
  serving_size_g: number;
  tags: string[];
  nutrients: NutrientProfile["nutrients"];
  ingredients?: string;
}

/** Parse a numeric nutrient value like "1.5g", "10mg", "NA". */
export function parseNutrientAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/&nbsp;/g, " ").trim();
  if (!cleaned || /^n\/?a$/i.test(cleaned)) return null;
  const match = cleaned.match(/([\d.]+)/);
  return match ? Math.round(parseFloat(match[1]) * 10) / 10 : null;
}

/** Extract gram weight from serving text, e.g. "7.5 oz Portion (170g)". */
export function parseServingSizeG(servingText: string): number {
  const cleaned = servingText.replace(/&nbsp;/g, " ").trim();
  const gMatch = cleaned.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (gMatch) return Math.round(parseFloat(gMatch[1]));

  const ozMatch = cleaned.match(/([\d.]+)\s*oz/i);
  if (ozMatch) return Math.round(parseFloat(ozMatch[1]) * 28.35);

  return 100;
}

function extractBetween(html: string, label: string): string | undefined {
  const re = new RegExp(
    `${label}<\\/span><span>&nbsp;([^<]+)`,
    "i",
  );
  return html.match(re)?.[1];
}

/** Parse ShowItemNutritionLabel HTML into normalized nutrients. */
export function parseNutritionLabelHtml(html: string): ParsedNetNutritionItem | null {
  const name = html.match(/cbo_nn_LabelHeader[^>]*>([^<]+)/)?.[1]?.trim();
  if (!name) return null;

  const servingBlock = html.match(
    /Serving Size<\/div><div[^>]*>([^<]+(?:\([^)]*\))?)/,
  )?.[1];
  const servingSize = (servingBlock ?? "1 serving").replace(/&nbsp;/g, " ").trim();

  const caloriesRaw = html.match(
    /Calories<\/span><\/div><div[^>]*>(\d+)/,
  )?.[1];

  const nutrients: NutrientProfile["nutrients"] = {};
  if (caloriesRaw) nutrients.calories = parseInt(caloriesRaw, 10);

  const map: [keyof NutrientProfile["nutrients"], string][] = [
    ["fat_g", "Total Fat"],
    ["saturated_fat_g", "Saturated Fat"],
    ["trans_fat_g", "Trans"],
    ["cholesterol_mg", "Cholesterol"],
    ["sodium_mg", "Sodium"],
    ["carbs_g", "Total Carbohydrate"],
    ["fiber_g", "Dietary Fiber"],
    ["sugar_g", "Total Sugars"],
    ["protein_g", "Protein"],
    ["potassium_mg", "Potassium"],
    ["calcium_mg", "Calcium"],
    ["iron_mg", "Iron"],
    ["vitamin_d_mcg", "Vitamin D"],
    ["vitamin_c_mg", "Vitamin C"],
  ];

  for (const [key, label] of map) {
    const raw =
      label === "Trans"
        ? html.match(/Trans.*?Fat<\/span><span>&nbsp;([^<]+)/i)?.[1]
        : extractBetween(html, label);
    const val = parseNutrientAmount(raw);
    if (val != null) nutrients[key] = val;
  }

  const ingredients = html
    .match(/Ingredients?:?<\/[^>]+>([^<]+)/i)?.[1]
    ?.replace(/&nbsp;/g, " ")
    .trim();

  return {
    name,
    servingSize,
    serving_size_g: parseServingSizeG(servingSize),
    tags: [],
    nutrients,
    ingredients: ingredients || undefined,
  };
}

/** Slug for catalog IDs. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
