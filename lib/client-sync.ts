import {
  GOALS_CHANGED_EVENT,
  GOALS_PREFIX,
  storeListKeys,
} from "@/lib/goals";
import type { ClientSyncPayload } from "@/types";

export type SyncNamespace = "goals" | "coach" | "finances";

export type HydrateResult = Record<SyncNamespace, boolean>;

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
const ALL_NAMESPACES: SyncNamespace[] = ["goals", "coach", "finances"];

const PUSH_DELAY_MS = 500;
const SYNC_CACHE_TTL_MS = 30_000;
const pushTimers: Partial<Record<SyncNamespace, ReturnType<typeof setTimeout>>> = {};

let cachedSync: ClientSyncPayload | null = null;
let cacheTime = 0;
let inflightFetch: Promise<ClientSyncPayload | null> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function emptyResult(): HydrateResult {
  return { goals: false, coach: false, finances: false };
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

function snapshotNamespace(ns: SyncNamespace): string {
  return JSON.stringify(collectNamespace(ns));
}

function invalidateSyncCache(): void {
  cachedSync = null;
  cacheTime = 0;
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

/** Write keys to localStorage; optionally notify listeners if data changed. */
function applyNamespaceKeys(
  ns: SyncNamespace,
  keys: Record<string, unknown>,
  notify: boolean,
): boolean {
  if (!isBrowser()) return false;
  const before = snapshotNamespace(ns);
  for (const [key, value] of Object.entries(keys)) {
    writeRaw(key, value);
  }
  const changed = before !== snapshotNamespace(ns);
  if (changed && notify) dispatchNamespaceChanged(ns);
  return changed;
}

export async function fetchClientSync(options?: {
  force?: boolean;
}): Promise<ClientSyncPayload | null> {
  if (!isBrowser()) return null;

  const force = options?.force ?? false;
  const now = Date.now();
  if (!force && cachedSync && now - cacheTime < SYNC_CACHE_TTL_MS) {
    return cachedSync;
  }
  if (!force && inflightFetch) return inflightFetch;

  inflightFetch = (async () => {
    try {
      const res = await fetch("/api/sync/client", { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      cachedSync = (json?.sync as ClientSyncPayload) ?? {};
      cacheTime = Date.now();
      return cachedSync;
    } catch {
      return null;
    } finally {
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

async function pushNamespace(ns: SyncNamespace): Promise<void> {
  const keys = collectNamespace(ns);
  try {
    const res = await fetch("/api/sync/client", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [ns]: keys }),
    });
    if (res.ok) invalidateSyncCache();
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
 * Hydrate namespaces from Supabase. Server wins when present; otherwise migrate
 * local data up once. Does not notify listeners (safe during initial mount).
 */
export async function hydrateClientSync(
  namespaces: SyncNamespace[] = ALL_NAMESPACES,
): Promise<HydrateResult> {
  const result = emptyResult();
  const remote = await fetchClientSync();
  if (!remote) return result;

  for (const ns of namespaces) {
    const remoteKeys = remote[ns];
    const hasRemote = remoteKeys && Object.keys(remoteKeys).length > 0;

    if (hasRemote) {
      result[ns] = applyNamespaceKeys(ns, remoteKeys, false);
    } else if (namespaceHasLocalData(ns)) {
      await pushNamespace(ns);
    }
  }

  return result;
}

/** Re-fetch from server when another device may have updated (notifies on change). */
export async function refreshClientSyncFromServer(): Promise<HydrateResult> {
  const result = emptyResult();
  const remote = await fetchClientSync({ force: true });
  if (!remote) return result;

  for (const ns of ALL_NAMESPACES) {
    const keys = remote[ns];
    if (keys && Object.keys(keys).length > 0) {
      result[ns] = applyNamespaceKeys(ns, keys, true);
    }
  }

  return result;
}
