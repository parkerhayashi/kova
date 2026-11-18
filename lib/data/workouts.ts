/**
 * Server-side lifting data, sourced entirely from Hevy imports (the `workouts`
 * table). Native Kova set tracking was removed in Oct 2026 — Hevy is the
 * source of truth for lifts. Feeds Trends, the cut coach, body-fat /
 * composition estimates, and the Home workout card.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { hevyVolumeLbs } from "@/lib/hevy";
import { addDays, todayInTimezone } from "@/lib/utils";
import { getTimezone } from "@/lib/data/oura";
import { listHevyWorkoutsSince } from "@/lib/data/hevy";
import {
  aggregateMuscleSplit,
  aggregateVolumeByDay,
  flattenHevyWorkouts,
  type UnifiedWorkingSet,
} from "@/lib/lifting-unified";
import {
  computeStrengthDeltaFromSets,
  sumVolumeInWindow,
  type LiftingCompositionSnapshot,
} from "@/lib/coach-composition";
import type { LiftingDashboard, WorkoutTodaySummary } from "@/types";

async function fetchHevySetsSince(sinceDate: string): Promise<UnifiedWorkingSet[]> {
  return flattenHevyWorkouts(await listHevyWorkoutsSince(sinceDate));
}

export async function getLiftingDashboard(
  periodDays = 28,
): Promise<LiftingDashboard> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const since = addDays(today, -(periodDays - 1));
  const sets = await fetchHevySetsSince(since);

  const sessionIds = new Set<string>();
  let totalSets = 0;
  const volumeByDate = aggregateVolumeByDay(sets);

  for (const set of sets) {
    if (set.is_warmup) continue;
    totalSets += 1;
    sessionIds.add(set.session_id);
  }

  let totalVolume = 0;
  for (const vol of volumeByDate.values()) {
    totalVolume += vol;
  }

  const volume_by_day: LiftingDashboard["volume_by_day"] = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = new Date(`${date}T12:00:00`);
    volume_by_day.push({
      date,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone }),
      volume_lbs: Math.round(volumeByDate.get(date) ?? 0),
    });
  }

  const workoutDays = new Set(sets.map((set) => set.date));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const date = addDays(today, -i);
    if (workoutDays.has(date)) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
  }

  return {
    period_days: periodDays,
    total_sessions: sessionIds.size,
    total_sets: totalSets,
    total_volume_lbs: Math.round(totalVolume),
    current_streak_days: streak,
    volume_by_day,
    muscle_split: aggregateMuscleSplit(sets),
  };
}

/** Hevy lifting signals for weight composition / body-fat estimates. */
export async function getLiftingCompositionSnapshot(
  windowDays = 30,
): Promise<LiftingCompositionSnapshot> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const periodStart = addDays(today, -(windowDays - 1));
  const historyStart = addDays(periodStart, -365);

  const allSets = await fetchHevySetsSince(historyStart);
  const inWindow = allSets.filter(
    (set) => set.date >= periodStart && set.date <= today,
  );
  const workoutDates = [...new Set(inWindow.map((set) => set.date))].sort();
  const sessionIds = new Set(inWindow.map((set) => set.session_id));

  const { strengthDelta, exerciseCount } = computeStrengthDeltaFromSets(
    allSets,
    periodStart,
  );

  return {
    updatedAt: new Date().toISOString(),
    windowDays,
    periodStart,
    periodEnd: today,
    workoutDates,
    totalVolumeLbs: sumVolumeInWindow(allSets, periodStart),
    totalSessions: sessionIds.size,
    totalSets: inWindow.filter((set) => !set.is_warmup).length,
    sessionsPerWeek: (workoutDates.length / Math.max(1, windowDays)) * 7,
    strengthDelta,
    strengthExerciseCount: exerciseCount,
    source: "hevy",
  };
}

export async function getTodayWorkoutSummary(
  readinessScore: number | null = null,
): Promise<WorkoutTodaySummary> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const db = createServiceClient();

  const { data: hevyRow } = await db
    .from("workouts")
    .select("title, volume_kg, duration")
    .eq("date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary = hevyRow
    ? {
        status: "completed_today" as const,
        title: hevyRow.title,
        volume_lbs: hevyVolumeLbs(hevyRow.volume_kg),
        duration_seconds: hevyRow.duration,
      }
    : {
        status: "none" as const,
        title: null,
        volume_lbs: null,
        duration_seconds: null,
      };
  return enrichWorkoutSummary(summary, today, readinessScore);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function formatDaysAgo(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

async function enrichWorkoutSummary(
  summary: Omit<WorkoutTodaySummary, "insight" | "last_session" | "volume_vs_avg_pct" | "training_streak_days">,
  today: string,
  readinessScore: number | null,
): Promise<WorkoutTodaySummary> {
  const dashboard = await getLiftingDashboard(28);
  const db = createServiceClient();

  const { data: lastHevy } = await db
    .from("workouts")
    .select("date, title")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let last_session: WorkoutTodaySummary["last_session"] = null;
  const last = lastHevy as { date?: string; title: string | null } | null;
  if (last?.date && (last.date !== today || summary.status === "none")) {
    last_session = {
      date: last.date,
      title: last.title,
      days_ago: daysBetween(last.date, today),
    };
  }

  let volume_vs_avg_pct: number | null = null;
  if (
    summary.status === "completed_today" &&
    summary.volume_lbs != null &&
    summary.volume_lbs > 0
  ) {
    const daysWithVol = dashboard.volume_by_day.filter((d) => d.volume_lbs > 0);
    const avg =
      daysWithVol.reduce((sum, d) => sum + d.volume_lbs, 0) /
      Math.max(1, daysWithVol.length);
    if (avg > 0) {
      volume_vs_avg_pct = Math.round(
        ((summary.volume_lbs - avg) / avg) * 100,
      );
    }
  }

  const streak = dashboard.current_streak_days;
  let insight: string | null = null;

  if (summary.status === "completed_today") {
    const parts: string[] = [];
    if (summary.volume_lbs != null) {
      parts.push(`${summary.volume_lbs.toLocaleString()} lb logged`);
    }
    if (volume_vs_avg_pct != null && Math.abs(volume_vs_avg_pct) >= 5) {
      parts.push(
        `${volume_vs_avg_pct >= 0 ? "+" : ""}${volume_vs_avg_pct}% vs 4-wk avg`,
      );
    }
    insight = parts.join(" · ") || "Session complete";
  } else {
    const parts: string[] = [];
    if (last_session) {
      const name = last_session.title ?? "Workout";
      parts.push(
        `Last: ${name} · ${formatDaysAgo(last_session.days_ago)}`,
      );
    }
    // Morning Body Battery (Garmin) — Kova's recovery signal since Oura was retired.
    if (readinessScore != null) {
      if (readinessScore >= 75) {
        parts.push(`Body Battery ${readinessScore} — good to train`);
      } else if (readinessScore < 50) {
        parts.push(`Body Battery ${readinessScore} — consider recovery`);
      } else {
        parts.push(`Body Battery ${readinessScore}`);
      }
    }
    if (streak >= 2) {
      parts.push(`${streak}-day streak`);
    }
    insight = parts.length > 0 ? parts.join(" · ") : "No session today";
  }

  return {
    ...summary,
    insight,
    last_session,
    volume_vs_avg_pct,
    training_streak_days: streak > 0 ? streak : null,
  };
}
