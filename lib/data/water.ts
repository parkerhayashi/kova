import { createServiceClient } from "@/lib/supabase/server";
import { normalizeWater, type WaterState } from "@/lib/water";

/** Load synced water tracker state from user_settings. */
export async function getWaterState(): Promise<WaterState | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("water_state")
    .limit(1)
    .maybeSingle();

  if (!data?.water_state || typeof data.water_state !== "object") return null;
  return normalizeWater(data.water_state as Partial<WaterState>);
}

/** Persist water tracker state to user_settings (cross-device sync). */
export async function saveWaterState(state: WaterState): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const payload = { water_state: state };

  if (data?.id) {
    await db.from("user_settings").update(payload).eq("id", data.id);
  } else {
    await db.from("user_settings").insert(payload);
  }
}
