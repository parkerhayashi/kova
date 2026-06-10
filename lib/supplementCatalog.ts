/**
 * A small catalog of common supplements with sensible default dose, unit, and a
 * timing/usage note. Powers the search-as-you-type picker on the Supplements
 * page — selecting one prefills the add form. Not medical advice; tweak freely.
 *
 * `nutrients` are per the catalog `dose` and roll into daily nutrition when logged.
 */
import type { DailyTotals } from "@/lib/nutrition";

export type SupplementNutrients = DailyTotals;

export interface SupplementPreset {
  name: string;
  dose: number;
  unit: string;
  note: string;
  nutrients?: SupplementNutrients;
}

export const SUPPLEMENT_CATALOG: SupplementPreset[] = [
  {
    name: "Vitamin D3",
    dose: 5000,
    unit: "IU",
    note: "Morning, with a fatty meal",
    nutrients: { vitamin_d_mcg: 125 },
  },
  {
    name: "Vitamin K2 (MK-7)",
    dose: 100,
    unit: "mcg",
    note: "With D3 and fat",
    nutrients: { vitamin_k_mcg: 100 },
  },
  {
    name: "Omega-3 Fish Oil",
    dose: 1000,
    unit: "mg",
    note: "With food",
    nutrients: { calories: 10, fat_g: 1, omega3_g: 0.3 },
  },
  {
    name: "Magnesium Glycinate",
    dose: 400,
    unit: "mg",
    note: "Evening, aids sleep",
    nutrients: { magnesium_mg: 400 },
  },
  { name: "Creatine Monohydrate", dose: 5, unit: "g", note: "Any time, daily" },
  {
    name: "Vitamin C",
    dose: 1000,
    unit: "mg",
    note: "Morning",
    nutrients: { vitamin_c_mg: 1000 },
  },
  {
    name: "Zinc",
    dose: 25,
    unit: "mg",
    note: "With food, not on an empty stomach",
    nutrients: { zinc_mg: 25 },
  },
  {
    name: "Vitamin B12",
    dose: 1000,
    unit: "mcg",
    note: "Morning",
    nutrients: { vitamin_b12_mcg: 1000 },
  },
  {
    name: "Vitamin B Complex",
    dose: 1,
    unit: "capsule",
    note: "Morning, with food",
    nutrients: {
      vitamin_b1_mg: 25,
      vitamin_b2_mg: 25,
      vitamin_b3_mg: 50,
      vitamin_b5_mg: 25,
      vitamin_b6_mg: 25,
      folate_mcg: 400,
      vitamin_b12_mcg: 100,
    },
  },
  { name: "Ashwagandha", dose: 600, unit: "mg", note: "Evening" },
  { name: "L-Theanine", dose: 200, unit: "mg", note: "With caffeine or evening" },
  { name: "Caffeine", dose: 100, unit: "mg", note: "Morning / pre-workout" },
  { name: "Melatonin", dose: 3, unit: "mg", note: "30–60 min before bed" },
  { name: "Probiotic", dose: 1, unit: "capsule", note: "Morning, empty stomach" },
  {
    name: "Iron",
    dose: 18,
    unit: "mg",
    note: "Empty stomach with vitamin C",
    nutrients: { iron_mg: 18 },
  },
  {
    name: "Calcium",
    dose: 500,
    unit: "mg",
    note: "With food, not with iron",
    nutrients: { calcium_mg: 500 },
  },
  {
    name: "Multivitamin",
    dose: 1,
    unit: "tablet",
    note: "With breakfast",
    nutrients: {
      calories: 10,
      vitamin_a_mcg: 900,
      vitamin_c_mg: 90,
      vitamin_d_mcg: 20,
      vitamin_e_mg: 15,
      vitamin_k_mcg: 120,
      vitamin_b1_mg: 1.2,
      vitamin_b2_mg: 1.3,
      vitamin_b3_mg: 16,
      vitamin_b6_mg: 1.7,
      folate_mcg: 400,
      vitamin_b12_mcg: 2.4,
      calcium_mg: 200,
      iron_mg: 8,
      magnesium_mg: 100,
      zinc_mg: 11,
      selenium_mcg: 55,
    },
  },
  { name: "Curcumin (Turmeric)", dose: 500, unit: "mg", note: "With food + black pepper" },
  {
    name: "CoQ10",
    dose: 100,
    unit: "mg",
    note: "With a fatty meal",
    nutrients: { calories: 5, fat_g: 0.5 },
  },
  {
    name: "Collagen",
    dose: 10,
    unit: "g",
    note: "Any time",
    nutrients: { calories: 35, protein_g: 9 },
  },
  {
    name: "Selenium",
    dose: 200,
    unit: "mcg",
    note: "With food",
    nutrients: { selenium_mcg: 200 },
  },
  {
    name: "Folate",
    dose: 400,
    unit: "mcg",
    note: "Morning",
    nutrients: { folate_mcg: 400 },
  },
  { name: "Biotin", dose: 5000, unit: "mcg", note: "Any time" },
  { name: "Glucosamine", dose: 1500, unit: "mg", note: "With food" },
  { name: "NAC", dose: 600, unit: "mg", note: "Empty stomach" },
  { name: "Rhodiola Rosea", dose: 400, unit: "mg", note: "Morning" },
  { name: "Lion's Mane", dose: 1000, unit: "mg", note: "Morning" },
  {
    name: "Electrolytes",
    dose: 1,
    unit: "serving",
    note: "Any time",
    nutrients: { calories: 10, sodium_mg: 500, potassium_mg: 200, magnesium_mg: 60 },
  },
  {
    name: "Whey Protein",
    dose: 1,
    unit: "scoop",
    note: "Post-workout",
    nutrients: { calories: 120, protein_g: 24, carbs_g: 3, fat_g: 1.5 },
  },
  { name: "Beta-Alanine", dose: 3, unit: "g", note: "Pre-workout" },
  { name: "Tongkat Ali", dose: 400, unit: "mg", note: "Morning" },
  {
    name: "Boron",
    dose: 6,
    unit: "mg",
    note: "With food",
  },
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function searchSupplements(query: string, limit = 6): SupplementPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SUPPLEMENT_CATALOG.filter((s) => s.name.toLowerCase().includes(q)).slice(
    0,
    limit,
  );
}

/** Best catalog nutrient match for a saved supplement name. */
export function catalogNutrientsForName(
  name: string,
): { dose: number; nutrients: SupplementNutrients } | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  let match =
    SUPPLEMENT_CATALOG.find((s) => normalizeName(s.name) === normalized) ??
    SUPPLEMENT_CATALOG.find(
      (s) =>
        s.nutrients &&
        (normalized.includes(normalizeName(s.name)) ||
          normalizeName(s.name).includes(normalized)),
    );

  if (!match?.nutrients) return null;
  return { dose: match.dose, nutrients: match.nutrients };
}

export function catalogPresetForName(name: string): SupplementPreset | null {
  const normalized = normalizeName(name);
  return (
    SUPPLEMENT_CATALOG.find((s) => normalizeName(s.name) === normalized) ??
    SUPPLEMENT_CATALOG.find(
      (s) =>
        normalized.includes(normalizeName(s.name)) ||
        normalizeName(s.name).includes(normalized),
    ) ??
    null
  );
}
