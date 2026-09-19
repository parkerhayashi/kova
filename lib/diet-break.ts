/**
 * Diet break — temporarily eat at maintenance during a cut
 * (flat pause, no reverse-diet calorie ramp).
 */
import { addDays, daysBetween, formatIsoDateLabel } from "@/lib/utils";
import type { DietBreakState } from "@/types";

export const DIET_BREAK_DURATIONS = [7, 14] as const;
export type DietBreakDurationDays = (typeof DIET_BREAK_DURATIONS)[number] | null;

export type DietBreakView = {
  active: boolean;
  state: DietBreakState | null;
  days_elapsed: number | null;
  days_remaining: number | null;
  headline: string;
  detail: string;
};

export function parseDietBreakState(raw: unknown): DietBreakState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<DietBreakState>;
  if (
    typeof s.active !== "boolean" ||
    typeof s.started_at !== "string" ||
    typeof s.start_weight_lbs !== "number"
  ) {
    return null;
  }
  const duration_days =
    typeof s.duration_days === "number" && s.duration_days > 0
      ? Math.round(s.duration_days)
      : null;
  return {
    active: s.active,
    started_at: s.started_at,
    start_weight_lbs: s.start_weight_lbs,
    duration_days,
    ends_on: typeof s.ends_on === "string" ? s.ends_on : null,
    completed_at: s.completed_at ?? null,
  };
}

export function buildDietBreakStart(input: {
  today: string;
  start_weight_lbs: number;
  duration_days?: DietBreakDurationDays;
}): DietBreakState {
  const duration_days = input.duration_days ?? null;
  const ends_on =
    duration_days != null ? addDays(input.today, duration_days - 1) : null;
  return {
    active: true,
    started_at: input.today,
    start_weight_lbs: input.start_weight_lbs,
    duration_days,
    ends_on,
    completed_at: null,
  };
}

/** Pin daily calories at estimated maintenance while a diet break is active. */
export function applyDietBreakCalories(input: {
  maintenance: number;
}): { calories: number; adjustment: number; reason: string } {
  const calories = Math.max(1200, Math.round(input.maintenance));
  return {
    calories,
    adjustment: 0,
    reason: "Diet break · eating at maintenance",
  };
}

/**
 * Auto-complete when a scheduled end date has passed.
 * Open-ended breaks stay active until stopped manually.
 */
export function reviewDietBreak(input: {
  state: DietBreakState;
  today: string;
}): { state: DietBreakState; changed: boolean; action: string } {
  const state = { ...input.state };
  if (!state.active) {
    return { state, changed: false, action: "inactive" };
  }
  if (state.ends_on && input.today > state.ends_on) {
    state.active = false;
    state.completed_at = input.today;
    return { state, changed: true, action: "complete" };
  }
  return { state, changed: false, action: "active" };
}

export function dietBreakView(input: {
  state: DietBreakState | null;
  today: string;
  maintenance: number;
}): DietBreakView {
  const { state, today, maintenance } = input;
  if (!state?.active) {
    return {
      active: false,
      state,
      days_elapsed: null,
      days_remaining: null,
      headline: state?.completed_at
        ? `Diet break ended ${state.completed_at}`
        : "No diet break",
      detail: state?.completed_at
        ? "Resume your cut when ready, or start reverse if the cut is done."
        : "Pause the deficit and eat at maintenance for a short reset.",
    };
  }

  const days_elapsed = Math.max(0, daysBetween(today, state.started_at)) + 1;
  const days_remaining =
    state.ends_on != null
      ? Math.max(0, daysBetween(state.ends_on, today))
      : null;

  let headline: string;
  if (days_remaining != null) {
    headline =
      days_remaining === 0
        ? "Last day of diet break"
        : `${days_remaining} day${days_remaining === 1 ? "" : "s"} left · at maintenance`;
  } else {
    headline = `Day ${days_elapsed} · eating at maintenance`;
  }

  const endNote = state.ends_on
    ? `Ends ${formatIsoDateLabel(state.ends_on, { month: "short", day: "numeric" })}`
    : "Open-ended — end when ready";

  return {
    active: true,
    state,
    days_elapsed,
    days_remaining,
    headline,
    detail: `Target ${Math.round(maintenance)} kcal · started ${state.started_at} · ${endNote}`,
  };
}
