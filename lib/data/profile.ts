import { createServiceClient } from "@/lib/supabase/server";
import { getOuraProfile, getUserSettings } from "@/lib/data/oura";
import { getLatestWeight } from "@/lib/data/tracking";
import { kgToLbs } from "@/lib/nutrition-goals";
import { profileSexToWater } from "@/lib/profile";
import { normalizeWater, type WaterState } from "@/lib/water";
import type { UserProfile } from "@/types";

export type ProfilePatch = {
  age?: number | null;
  height_m?: number | null;
  biological_sex?: string | null;
};

/** Canonical profile: user_settings wins, then weight log / Oura. */
export async function getUserProfile(): Promise<UserProfile> {
  const [settings, weight, oura] = await Promise.all([
    getUserSettings(),
    getLatestWeight(),
    getOuraProfile(),
  ]);

  const age = settings?.age ?? oura?.age ?? null;
  const height_m = settings?.height_m ?? oura?.height ?? null;
  const biological_sex = settings?.biological_sex ?? oura?.biological_sex ?? null;

  const weight_lbs =
    weight?.weight_lbs ??
    (oura?.weight != null ? Math.round(kgToLbs(oura.weight) * 10) / 10 : null);

  return {
    age,
    height_m,
    biological_sex,
    weight_lbs,
    body_fat_pct: weight?.body_fat_pct ?? null,
    sources: {
      age: settings?.age != null ? "settings" : oura?.age != null ? "oura" : null,
      height_m:
        settings?.height_m != null
          ? "settings"
          : oura?.height != null
            ? "oura"
            : null,
      biological_sex:
        settings?.biological_sex != null
          ? "settings"
          : oura?.biological_sex != null
            ? "oura"
            : null,
      weight_lbs:
        weight?.weight_lbs != null
          ? "weight_log"
          : oura?.weight != null
            ? "oura"
            : null,
      body_fat_pct: weight?.body_fat_pct != null ? "weight_log" : null,
    },
  };
}

export async function saveUserProfile(patch: ProfilePatch): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id, water_state")
    .limit(1)
    .maybeSingle();
  if (!row) throw new Error("Settings not found");

  await db
    .from("user_settings")
    .update({
      age: patch.age ?? null,
      height_m: patch.height_m ?? null,
      biological_sex: patch.biological_sex ?? null,
    })
    .eq("id", row.id);

  if (row.water_state && typeof row.water_state === "object") {
    const profile = await getUserProfile();
    const water = normalizeWater(row.water_state as Partial<WaterState>);
    const weightKg =
      profile.weight_lbs != null
        ? profile.weight_lbs / 2.204_622_621_8
        : water.profile.weightKg;

    const next = normalizeWater({
      ...water,
      profile: {
        ...water.profile,
        age: profile.age ?? water.profile.age,
        sex: profileSexToWater(profile.biological_sex),
        weightKg: Math.round(weightKg * 10) / 10,
      },
    });

    await db.from("user_settings").update({ water_state: next }).eq("id", row.id);
  }
}

/** Backfill empty user_settings profile fields from Oura after sync. */
export async function seedProfileFromOuraIfEmpty(): Promise<void> {
  const db = createServiceClient();
  const [settings, oura] = await Promise.all([getUserSettings(), getOuraProfile()]);
  if (!settings || !oura) return;

  const patch: ProfilePatch = {};
  if (settings.age == null && oura.age != null) patch.age = oura.age;
  if (settings.height_m == null && oura.height != null) patch.height_m = oura.height;
  if (settings.biological_sex == null && oura.biological_sex != null) {
    patch.biological_sex = oura.biological_sex;
  }

  if (Object.keys(patch).length === 0) return;

  await db.from("user_settings").update(patch).eq("id", settings.id);
}

/** Merge canonical profile into water state (does not persist). */
export function applyProfileToWater(
  state: WaterState,
  profile: UserProfile,
): WaterState {
  const weightKg =
    profile.weight_lbs != null
      ? profile.weight_lbs / 2.204_622_621_8
      : state.profile.weightKg;

  return normalizeWater({
    ...state,
    profile: {
      ...state.profile,
      age: profile.age ?? state.profile.age,
      sex: profileSexToWater(profile.biological_sex),
      weightKg: Math.round(weightKg * 10) / 10,
    },
  });
}
