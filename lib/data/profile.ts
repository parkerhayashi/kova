import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getOuraProfile, getUserSettings } from "@/lib/data/oura";
import { getLatestWeight } from "@/lib/data/tracking";
import {
  kgToLbs,
  parseActivityLevel,
  type ActivityLevel,
} from "@/lib/nutrition-goals";
import type { UserProfile } from "@/types";

export type ProfilePatch = {
  age?: number | null;
  height_m?: number | null;
  biological_sex?: string | null;
  activity_level?: ActivityLevel | null;
};

/** Canonical profile: user_settings wins, then weight log / Oura. */
export const getUserProfile = cache(async function getUserProfile(): Promise<UserProfile> {
  const [settings, weight, oura] = await Promise.all([
    getUserSettings(),
    getLatestWeight(),
    getOuraProfile(),
  ]);

  const age = settings?.age ?? oura?.age ?? null;
  const height_m = settings?.height_m ?? oura?.height ?? null;
  const biological_sex = settings?.biological_sex ?? oura?.biological_sex ?? null;
  const activity_level = settings?.activity_level
    ? parseActivityLevel(settings.activity_level)
    : null;

  const weight_lbs =
    weight?.weight_lbs ??
    (oura?.weight != null ? Math.round(kgToLbs(oura.weight) * 10) / 10 : null);

  const visualPct = settings?.visual_body_fat_state?.pct ?? null;
  const body_fat_pct =
    weight?.body_fat_pct != null && weight.body_fat_pct > 0
      ? weight.body_fat_pct
      : visualPct != null && visualPct > 0
        ? visualPct
        : null;

  return {
    age,
    height_m,
    biological_sex,
    activity_level,
    weight_lbs,
    body_fat_pct,
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
      activity_level: settings?.activity_level != null ? "settings" : null,
      weight_lbs:
        weight?.weight_lbs != null
          ? "weight_log"
          : oura?.weight != null
            ? "oura"
            : null,
      body_fat_pct:
        weight?.body_fat_pct != null && weight.body_fat_pct > 0
          ? "weight_log"
          : visualPct != null && visualPct > 0
            ? "visual"
            : null,
    },
  };
});

export async function saveUserProfile(patch: ProfilePatch): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) throw new Error("Settings not found");

  const update: Record<string, unknown> = {
    age: patch.age ?? null,
    height_m: patch.height_m ?? null,
    biological_sex: patch.biological_sex ?? null,
  };
  if (patch.activity_level !== undefined) {
    update.activity_level =
      patch.activity_level != null
        ? parseActivityLevel(patch.activity_level)
        : null;
  }

  await db.from("user_settings").update(update).eq("id", row.id);
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
