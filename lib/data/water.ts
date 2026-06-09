import { createServiceClient } from "@/lib/supabase/server";
import { applyProfileToWater } from "@/lib/profile";
import { getUserProfile, syncWaterProfileToCanonical } from "@/lib/data/profile";
import { normalizeWater, type WaterState } from "@/lib/water";

/** Load synced water tracker state, merged with canonical profile. */
export async function getWaterState(): Promise<WaterState | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("water_state")
    .limit(1)
    .maybeSingle();

  const profile = await getUserProfile();
  const base = normalizeWater(
    data?.water_state && typeof data.water_state === "object"
      ? (data.water_state as Partial<WaterState>)
      : null,
  );
  return applyProfileToWater(base, profile);
}

/** Persist water tracker state and sync profile fields back to user_settings. */
export async function saveWaterState(state: WaterState): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  await syncWaterProfileToCanonical(state);

  const payload = { water_state: state };

  if (data?.id) {
    await db.from("user_settings").update(payload).eq("id", data.id);
  } else {
    await db.from("user_settings").insert(payload);
  }
}
