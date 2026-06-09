import { profileSexToWater } from "@/lib/profile";
import {
  loadWater,
  normalizeWater,
  saveWater,
  type WaterState,
} from "@/lib/water";

async function fetchProfileForWater(): Promise<Partial<WaterState> | null> {
  try {
    const res = await fetch("/api/profile", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const p = json?.profile;
    if (!p) return null;

    const weightKg =
      p.weight_lbs != null ? p.weight_lbs / 2.204_622_621_8 : undefined;

    return {
      profile: {
        age: p.age ?? undefined,
        sex: p.biological_sex != null ? profileSexToWater(p.biological_sex) : undefined,
        weightKg: weightKg != null ? Math.round(weightKg * 10) / 10 : undefined,
      } as WaterState["profile"],
    };
  } catch {
    return null;
  }
}

/** Pull water state from Supabase (session required). */
export async function fetchWaterState(): Promise<WaterState | null> {
  try {
    const res = await fetch("/api/water/state", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.state) return null;
    return normalizeWater(json.state);
  } catch {
    return null;
  }
}

/** Push water state to Supabase (session required). */
export async function pushWaterState(state: WaterState): Promise<void> {
  try {
    await fetch("/api/water/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    /* offline — localStorage remains the fallback until next sync */
  }
}

/**
 * Hydrate from the server on load. Server wins when present; otherwise migrate
 * localStorage data up to Supabase once.
 */
export async function hydrateWaterState(): Promise<WaterState> {
  const local = loadWater();
  const [remote, profileOverlay] = await Promise.all([
    fetchWaterState(),
    fetchProfileForWater(),
  ]);

  if (remote) {
    const merged = normalizeWater({ ...remote, ...(profileOverlay ?? {}) });
    saveWater(merged);
    return merged;
  }

  const localMerged = normalizeWater({ ...local, ...(profileOverlay ?? {}) });

  if (Object.keys(local.logs).length > 0) {
    await pushWaterState(localMerged);
  }

  saveWater(localMerged);
  return localMerged;
}

/** Save locally and sync to Supabase. */
export function commitWaterState(state: WaterState): void {
  saveWater(state);
  void pushWaterState(state);
}

/** Re-fetch from server (e.g. when another device may have updated). */
export async function refreshWaterFromServer(): Promise<WaterState | null> {
  const [remote, profileOverlay] = await Promise.all([
    fetchWaterState(),
    fetchProfileForWater(),
  ]);
  if (!remote) return null;
  const merged = normalizeWater({ ...remote, ...(profileOverlay ?? {}) });
  saveWater(merged);
  return merged;
}
