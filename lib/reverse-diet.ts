/**
 * Reverse diet — ramp calories up after a cut until weight stabilizes
 * near estimated maintenance.
 */
import { addDays, daysBetween } from "@/lib/utils";
import type { ReverseDietState } from "@/types";

export const REVERSE_STEP_KCAL = 100;
export const REVERSE_REVIEW_DAYS = 7;
/** Allow a little overshoot past formula maintenance while finding true TDEE. */
export const REVERSE_MAINTENANCE_CAP_BUFFER = 100;
/** Bump when weekly rate is at or below this (lb/week). */
export const REVERSE_BUMP_RATE_MAX = 0.25;
/** Hold bumps when weekly rate exceeds this (lb/week). */
export const REVERSE_HOLD_RATE = 0.45;

export type ReverseDietView = {
  active: boolean;
  state: ReverseDietState | null;
  /** Current reverse target (start + added), before maintenance cap. */
  target_calories: number | null;
  /** Gap from current reverse target up to maintenance. */
  kcal_to_maintenance: number | null;
  next_review_on: string | null;
  holding: boolean;
  headline: string;
  detail: string;
};

export function parseReverseDietState(raw: unknown): ReverseDietState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<ReverseDietState>;
  if (
    typeof s.active !== "boolean" ||
    typeof s.started_at !== "string" ||
    typeof s.start_calories !== "number" ||
    typeof s.added_kcal !== "number" ||
    typeof s.start_weight_lbs !== "number"
  ) {
    return null;
  }
  return {
    active: s.active,
    started_at: s.started_at,
    start_weight_lbs: s.start_weight_lbs,
    start_calories: s.start_calories,
    added_kcal: s.added_kcal,
    step_kcal: s.step_kcal ?? REVERSE_STEP_KCAL,
    review_every_days: s.review_every_days ?? REVERSE_REVIEW_DAYS,
    last_review_at: s.last_review_at ?? s.started_at,
    hold_until: s.hold_until ?? null,
    completed_at: s.completed_at ?? null,
  };
}

export function buildReverseDietStart(input: {
  today: string;
  start_calories: number;
  start_weight_lbs: number;
  step_kcal?: number;
  review_every_days?: number;
}): ReverseDietState {
  return {
    active: true,
    started_at: input.today,
    start_weight_lbs: input.start_weight_lbs,
    start_calories: Math.round(input.start_calories),
    added_kcal: 0,
    step_kcal: input.step_kcal ?? REVERSE_STEP_KCAL,
    review_every_days: input.review_every_days ?? REVERSE_REVIEW_DAYS,
    last_review_at: input.today,
    hold_until: null,
    completed_at: null,
  };
}

export function reverseTargetCalories(state: ReverseDietState): number {
  return Math.round(state.start_calories + state.added_kcal);
}

/** Apply reverse diet as the daily calorie target (caps near maintenance). */
export function applyReverseDietCalories(input: {
  state: ReverseDietState;
  maintenance: number;
}): { calories: number; adjustment: number; reason: string } {
  const raw = reverseTargetCalories(input.state);
  const cap = input.maintenance + REVERSE_MAINTENANCE_CAP_BUFFER;
  const calories = Math.max(1200, Math.min(raw, cap));
  const adjustment = calories - input.maintenance;
  const gap = Math.max(0, input.maintenance - calories);
  const reason =
    gap > 0
      ? `Reverse diet +${input.state.added_kcal} kcal · ${gap} below maintenance`
      : `Reverse diet +${input.state.added_kcal} kcal · at/near maintenance`;
  return { calories, adjustment: Math.round(adjustment), reason };
}

/**
 * Weekly review: bump, hold, or complete based on recent weight rate (lb/week).
 * `rateLbWeek` null → no change (need more weigh-ins).
 */
export function reviewReverseDiet(input: {
  state: ReverseDietState;
  today: string;
  rateLbWeek: number | null;
  maintenance: number;
}): { state: ReverseDietState; changed: boolean; action: string } {
  const state = { ...input.state };
  if (!state.active) {
    return { state, changed: false, action: "inactive" };
  }

  if (state.hold_until && input.today < state.hold_until) {
    return { state, changed: false, action: "holding" };
  }

  const sinceReview = daysBetween(input.today, state.last_review_at);
  if (sinceReview < state.review_every_days) {
    return { state, changed: false, action: "waiting" };
  }

  const target = reverseTargetCalories(state);
  const atMaintenance = target >= input.maintenance - 50;
  const rate = input.rateLbWeek;

  if (rate == null) {
    state.last_review_at = input.today;
    state.hold_until = null;
    return { state, changed: true, action: "need_weight" };
  }

  // Rising too fast — hold this step.
  if (rate > REVERSE_HOLD_RATE) {
    state.last_review_at = input.today;
    state.hold_until = addDays(input.today, state.review_every_days);
    return { state, changed: true, action: "hold_gain" };
  }

  // Near maintenance and stable → done.
  if (atMaintenance && Math.abs(rate) <= REVERSE_BUMP_RATE_MAX) {
    state.active = false;
    state.completed_at = input.today;
    state.last_review_at = input.today;
    state.hold_until = null;
    return { state, changed: true, action: "complete" };
  }

  // Still below maintenance and not gaining meaningfully → bump.
  if (!atMaintenance && rate <= REVERSE_BUMP_RATE_MAX) {
    state.added_kcal += state.step_kcal;
    state.last_review_at = input.today;
    state.hold_until = null;
    return { state, changed: true, action: "bump" };
  }

  // Mild upward drift — hold without extending a long pause.
  state.last_review_at = input.today;
  state.hold_until = null;
  return { state, changed: true, action: "hold_mild" };
}

export function reverseDietView(input: {
  state: ReverseDietState | null;
  today: string;
  maintenance: number;
  rateLbWeek: number | null;
}): ReverseDietView {
  const { state, today, maintenance } = input;
  if (!state?.active) {
    return {
      active: false,
      state,
      target_calories: null,
      kcal_to_maintenance: null,
      next_review_on: null,
      holding: false,
      headline: state?.completed_at
        ? `Reverse diet completed ${state.completed_at}`
        : "Not reversing",
      detail: state?.completed_at
        ? "Weight stabilized near maintenance. Set a maintain or lean bulk goal when ready."
        : "Start a reverse diet to climb calories slowly after a cut.",
    };
  }

  const target = reverseTargetCalories(state);
  const capped = Math.min(target, maintenance + REVERSE_MAINTENANCE_CAP_BUFFER);
  const gap = Math.max(0, maintenance - capped);
  const holding = Boolean(state.hold_until && today < state.hold_until);
  const next = holding
    ? state.hold_until
    : addDays(state.last_review_at, state.review_every_days);

  let headline: string;
  if (holding) {
    headline = "Holding — scale rose this week";
  } else if (gap <= 50) {
    headline = "Near maintenance — watching for stability";
  } else {
    headline = `${gap} kcal below maintenance · +${state.added_kcal} so far`;
  }

  const rateNote =
    input.rateLbWeek == null
      ? "Need more weigh-ins for the next review"
      : `7d pace ${input.rateLbWeek > 0 ? "+" : ""}${input.rateLbWeek.toFixed(2)} lb/wk`;

  return {
    active: true,
    state,
    target_calories: capped,
    kcal_to_maintenance: gap,
    next_review_on: next,
    holding,
    headline,
    detail: `Target ${capped} kcal · next review ${next} · ${rateNote}`,
  };
}
