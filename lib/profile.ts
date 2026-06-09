import { normalizeWater, type Sex, type WaterState } from "@/lib/water";
import type { UserProfile } from "@/types";

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

/** Merge canonical profile into water state (does not persist). */
export function applyProfileToWater(
  state: WaterState,
  profile: UserProfile,
): WaterState {
  const weightDisplay =
    profile.weight_lbs != null
      ? state.weightUnit === "lb"
        ? Math.round(profile.weight_lbs * 10) / 10
        : Math.round((profile.weight_lbs / 2.204_622_621_8) * 10) / 10
      : state.profile.weightKg;

  return normalizeWater({
    ...state,
    profile: {
      ...state.profile,
      age: profile.age ?? state.profile.age,
      sex:
        profile.biological_sex != null
          ? profileSexToWater(profile.biological_sex)
          : state.profile.sex,
      weightKg: weightDisplay,
    },
  });
}
