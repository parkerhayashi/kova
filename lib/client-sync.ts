import {
  GOALS_CHANGED_EVENT,
  GOALS_PREFIX,
  storeListKeys,
} from "@/lib/goals";
import type { ClientSyncPayload } from "@/types";

export type SyncNamespace = "goals" | "coach" | "finances";

export const CLIENT_SYNC_CHANGED_EVENT = "client-sync-changed";

const STREAK_KEY = "goal_streak_v1";
const COACH_KEYS = ["po_coach_v1", "po_coach_workout_done", "po_coach_photos"] as const;
const FINANCE_EXACT_KEYS = [
  "subs",
  "wishlist",
  "incoming_orders",
  "finance_active_tab",
  "nw_currency",
] as const;

const PUSH_DELAY_MS = 500;
const pushTimers: Partial<Record<SyncNamespace, ReturnType<typeof setTimeout>>> = {};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readRaw(key: string): unknown {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: unknown): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function collectGoals(): Record<string, unknown> {
  const keys: Record<string, unknown> = {};
  for (const key of storeListKeys(GOALS_PREFIX)) {
    const v = readRaw(key);
    if (v != null) keys[key] = v;
  }
  const streak = readRaw(STREAK_KEY);
  if (streak != null) keys[STREAK_KEY] = streak;
  return keys;
}

function collectCoach(): Record<string, unknown> {
  const keys: Record<string, unknown> = {};
  for (const key of COACH_KEYS) {
    const v = readRaw(key);
    if (v != null) keys[key] = v;
  }
  return keys;
}

function collectFinances(): Record<string, unknown> {
  const keys: Record<string, unknown> = {};
  if (!isBrowser()) return keys;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith("nw:")) {
      const v = readRaw(key);
      if (v != null) keys[key] = v;
    }
  }
  for (const key of FINANCE_EXACT_KEYS) {
    const v = readRaw(key);
    if (v != null) keys[key] = v;
  }
  return keys;
}

function collectNamespace(ns: SyncNamespace): Record<string, unknown> {
  switch (ns) {
    case "goals":
      return collectGoals();
    case "coach":
      return collectCoach();
    case "finances":
      return collectFinances();
  }
}

function namespaceHasLocalData(ns: SyncNamespace): boolean {
  return Object.keys(collectNamespace(ns)).length > 0;
}

function dispatchNamespaceChanged(ns: SyncNamespace): void {
  if (!isBrowser()) return;
  if (ns === "goals") {
    window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT));
  }
  window.dispatchEvent(
    new CustomEvent(CLIENT_SYNC_CHANGED_EVENT, { detail: { namespace: ns } }),
  );
}

function applyNamespace(ns: SyncNamespace, keys: Record<string, unknown>): void {
  if (!isBrowser()) return;
  for (const [key, value] of Object.entries(keys)) {
    writeRaw(key, value);
  }
  dispatchNamespaceChanged(ns);
}

export async function fetchClientSync(): Promise<ClientSyncPayload | null> {
  try {
    const res = await fetch("/api/sync/client", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.sync as ClientSyncPayload) ?? null;
  } catch {
    return null;
  }
}

async function pushNamespace(ns: SyncNamespace): Promise<void> {
  const keys = collectNamespace(ns);
  try {
    await fetch("/api/sync/client", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [ns]: keys }),
    });
  } catch {
    /* offline — localStorage remains until next sync */
  }
}

/** Debounced push after a local write. */
export function scheduleClientSyncPush(ns: SyncNamespace): void {
  if (!isBrowser()) return;
  const prev = pushTimers[ns];
  if (prev) clearTimeout(prev);
  pushTimers[ns] = setTimeout(() => {
    pushTimers[ns] = undefined;
    void pushNamespace(ns);
  }, PUSH_DELAY_MS);
}

/**
 * Hydrate namespaces from Supabase on load. Server wins when present; otherwise
 * migrate local data up once.
 */
export async function hydrateClientSync(
  namespaces: SyncNamespace[] = ["goals", "coach", "finances"],
): Promise<void> {
  const remote = await fetchClientSync();

  for (const ns of namespaces) {
    const remoteKeys = remote?.[ns];
    const hasRemote = remoteKeys && Object.keys(remoteKeys).length > 0;

    if (hasRemote) {
      applyNamespace(ns, remoteKeys);
    } else if (namespaceHasLocalData(ns)) {
      await pushNamespace(ns);
    }
  }
}

/** Re-fetch from server (e.g. when another device may have updated). */
export async function refreshClientSyncFromServer(): Promise<void> {
  const remote = await fetchClientSync();
  if (!remote) return;

  for (const ns of ["goals", "coach", "finances"] as SyncNamespace[]) {
    const keys = remote[ns];
    if (keys && Object.keys(keys).length > 0) {
      applyNamespace(ns, keys);
    }
  }
}
