/**
 * Client-side goal store for the home dashboard. Keys: `goals:YYYY-MM-DD` → Goal[].
 * Streak state lives under `goal_streak_v1`. Synced to Supabase via lib/client-sync.ts.
 *
 * The "day" boundary is 6 AM, not midnight: anything logged before 6 AM still
 * belongs to the previous calendar day's list.
 */

export interface Goal {
  text: string;
  done: boolean;
  doneAt?: number;
  queued?: boolean;
}

export interface StreakState {
  count: number;
  lastProcessedDate: string | null;
}

export const GOALS_PREFIX = "goals:";
const STREAK_KEY = "goal_streak_v1";
export const GOALS_CHANGED_EVENT = "goals-changed";

export function goalsKey(date: string): string {
  return `${GOALS_PREFIX}${date}`;
}

// --- storage primitives ----------------------------------------------------
export function storeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  if (key.startsWith(GOALS_PREFIX) || key === STREAK_KEY) {
    window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT));
    import("@/lib/client-sync").then(({ scheduleClientSyncPush }) => {
      scheduleClientSyncPush("goals");
    });
  }
}

export function storeDelete(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
  if (key.startsWith(GOALS_PREFIX)) {
    window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT));
    import("@/lib/client-sync").then(({ scheduleClientSyncPush }) => {
      scheduleClientSyncPush("goals");
    });
  }
}

export function storeListKeys(prefix: string): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

// --- date logic (6 AM boundary) --------------------------------------------
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getActiveDateString(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return dateStr(d);
}

export function getTomorrowDateString(now: Date = new Date()): string {
  // Before 6 AM the active day is yesterday, so "tomorrow" is today's date.
  if (now.getHours() < 6) return dateStr(now);
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return dateStr(d);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function getTodayGoals(): Goal[] {
  return storeGet<Goal[]>(goalsKey(getActiveDateString())) ?? [];
}

// --- streak + rollover (run once on load, streak BEFORE rollover) ----------
/**
 * Walk completed past days in order and update the streak. Runs before rollover
 * so the historical records still exist. Empty days don't break the streak.
 */
export function runStreakCheck(): number {
  const today = getActiveDateString();
  const state =
    storeGet<StreakState>(STREAK_KEY) ?? { count: 0, lastProcessedDate: null };
  let { count, lastProcessedDate } = state;

  const dates = storeListKeys(GOALS_PREFIX)
    .map((k) => k.slice(GOALS_PREFIX.length))
    .filter((d) => d < today)
    .sort();

  for (const date of dates) {
    if (lastProcessedDate && date <= lastProcessedDate) continue;
    const goals = storeGet<Goal[]>(goalsKey(date)) ?? [];
    if (goals.length === 0) {
      lastProcessedDate = date;
      continue;
    }
    count = goals.every((g) => g.done) ? count + 1 : 0;
    lastProcessedDate = date;
  }

  storeSet(STREAK_KEY, { count, lastProcessedDate });
  return count;
}

/**
 * Pull undone goals from any day older than the active date into today's list
 * (deduped by exact text), then delete the old record.
 */
export function runRollover(): void {
  const active = getActiveDateString();
  const todayKey = goalsKey(active);
  const today = storeGet<Goal[]>(todayKey) ?? [];
  let changed = false;

  for (const key of storeListKeys(GOALS_PREFIX)) {
    const date = key.slice(GOALS_PREFIX.length);
    if (date >= active) continue;
    const old = storeGet<Goal[]>(key) ?? [];
    for (const g of old) {
      if (!g.done && !today.some((t) => t.text === g.text)) {
        today.push({ text: g.text, done: false, queued: g.queued });
        changed = true;
      }
    }
    storeDelete(key);
  }

  if (changed) storeSet(todayKey, today);
}

export function getStreak(): number {
  return storeGet<StreakState>(STREAK_KEY)?.count ?? 0;
}
