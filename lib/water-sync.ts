import {
  loadWater,
  normalizeWater,
  saveWater,
  type WaterState,
} from "@/lib/water";

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
  const remote = await fetchWaterState();

  if (remote) {
    saveWater(remote);
    return remote;
  }

  if (Object.keys(local.logs).length > 0) {
    await pushWaterState(local);
  }

  return local;
}

/** Save locally and sync to Supabase. */
export function commitWaterState(state: WaterState): void {
  saveWater(state);
  void pushWaterState(state);
}

/** Re-fetch from server (e.g. when another device may have updated). */
export async function refreshWaterFromServer(): Promise<WaterState | null> {
  const remote = await fetchWaterState();
  if (!remote) return null;
  saveWater(remote);
  return remote;
}
