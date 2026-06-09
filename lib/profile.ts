import type { Sex } from "@/lib/water";

const IN_PER_M = 39.370_078_740_157;

export function metersToInches(m: number): number {
  return Math.round(m * IN_PER_M * 10) / 10;
}

export function inchesToMeters(inches: number): number {
  return inches / IN_PER_M;
}

export function profileSexToWater(sex: string | null): Sex {
  const s = sex?.toLowerCase() ?? "";
  if (s.includes("female") || s === "f") return "f";
  if (s.includes("male") || s === "m") return "m";
  return "o";
}

export function waterSexToProfile(sex: Sex): string {
  if (sex === "f") return "female";
  if (sex === "m") return "male";
  return "other";
}

export function normalizeProfileSex(sex: string | null): string {
  const s = sex?.toLowerCase() ?? "";
  if (s.includes("female") || s === "f") return "female";
  if (s.includes("male") || s === "m") return "male";
  return "other";
}
