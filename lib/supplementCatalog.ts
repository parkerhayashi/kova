/**
 * A small catalog of common supplements with sensible default dose, unit, and a
 * timing/usage note. Powers the search-as-you-type picker on the Supplements
 * page — selecting one prefills the add form. Not medical advice; tweak freely.
 */
export interface SupplementPreset {
  name: string;
  dose: number;
  unit: string;
  note: string;
}

export const SUPPLEMENT_CATALOG: SupplementPreset[] = [
  { name: "Vitamin D3", dose: 5000, unit: "IU", note: "Morning, with a fatty meal" },
  { name: "Vitamin K2 (MK-7)", dose: 100, unit: "mcg", note: "With D3 and fat" },
  { name: "Omega-3 Fish Oil", dose: 1000, unit: "mg", note: "With food" },
  { name: "Magnesium Glycinate", dose: 400, unit: "mg", note: "Evening, aids sleep" },
  { name: "Creatine Monohydrate", dose: 5, unit: "g", note: "Any time, daily" },
  { name: "Vitamin C", dose: 1000, unit: "mg", note: "Morning" },
  { name: "Zinc", dose: 25, unit: "mg", note: "With food, not on an empty stomach" },
  { name: "Vitamin B12", dose: 1000, unit: "mcg", note: "Morning" },
  { name: "Vitamin B Complex", dose: 1, unit: "capsule", note: "Morning, with food" },
  { name: "Ashwagandha", dose: 600, unit: "mg", note: "Evening" },
  { name: "L-Theanine", dose: 200, unit: "mg", note: "With caffeine or evening" },
  { name: "Caffeine", dose: 100, unit: "mg", note: "Morning / pre-workout" },
  { name: "Melatonin", dose: 3, unit: "mg", note: "30–60 min before bed" },
  { name: "Probiotic", dose: 1, unit: "capsule", note: "Morning, empty stomach" },
  { name: "Iron", dose: 18, unit: "mg", note: "Empty stomach with vitamin C" },
  { name: "Calcium", dose: 500, unit: "mg", note: "With food, not with iron" },
  { name: "Multivitamin", dose: 1, unit: "tablet", note: "With breakfast" },
  { name: "Curcumin (Turmeric)", dose: 500, unit: "mg", note: "With food + black pepper" },
  { name: "CoQ10", dose: 100, unit: "mg", note: "With a fatty meal" },
  { name: "Collagen", dose: 10, unit: "g", note: "Any time" },
  { name: "Selenium", dose: 200, unit: "mcg", note: "With food" },
  { name: "Folate", dose: 400, unit: "mcg", note: "Morning" },
  { name: "Biotin", dose: 5000, unit: "mcg", note: "Any time" },
  { name: "Glucosamine", dose: 1500, unit: "mg", note: "With food" },
  { name: "NAC", dose: 600, unit: "mg", note: "Empty stomach" },
  { name: "Rhodiola Rosea", dose: 400, unit: "mg", note: "Morning" },
  { name: "Lion's Mane", dose: 1000, unit: "mg", note: "Morning" },
  { name: "Electrolytes", dose: 1, unit: "serving", note: "Any time" },
  { name: "Whey Protein", dose: 1, unit: "scoop", note: "Post-workout" },
  { name: "Beta-Alanine", dose: 3, unit: "g", note: "Pre-workout" },
  { name: "Tongkat Ali", dose: 400, unit: "mg", note: "Morning" },
  { name: "Boron", dose: 6, unit: "mg", note: "With food" },
];

export function searchSupplements(query: string, limit = 6): SupplementPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SUPPLEMENT_CATALOG.filter((s) => s.name.toLowerCase().includes(q)).slice(
    0,
    limit,
  );
}
