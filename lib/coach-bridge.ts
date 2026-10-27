/**
 * Client-side cache of the server Hevy lifting snapshot, used by the Coach
 * composition estimate (components/coach/coachApp.ts).
 */

import { CLIENT_SYNC_CHANGED_EVENT } from "@/lib/client-sync";
import type { LiftingCompositionSnapshot } from "@/lib/coach-composition";

const LIFTING_SNAPSHOT_KEY = "po_coach_lifting_snapshot";

export function loadLiftingSnapshot(): LiftingCompositionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LIFTING_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LiftingCompositionSnapshot;
  } catch {
    return null;
  }
}

function saveLiftingSnapshot(snapshot: LiftingCompositionSnapshot): void {
  localStorage.setItem(LIFTING_SNAPSHOT_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(
    new CustomEvent(CLIENT_SYNC_CHANGED_EVENT, {
      detail: { namespace: "lifting" },
    }),
  );
}

/** Pull Hevy lifting stats from the server for the Coach composition estimate. */
export async function refreshLiftingSnapshot(windowDays = 30): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch(
      `/api/workouts/lifting-snapshot?days=${windowDays}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const snapshot = (await res.json()) as LiftingCompositionSnapshot;
    saveLiftingSnapshot(snapshot);
  } catch {
    /* best-effort */
  }
}
