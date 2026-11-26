/** Sport colors and session marks shared by the calendar and the day view. */
import type { CSSProperties } from "react";
import { entryDone, entrySport } from "@/lib/run-calendar";
import { formatDistance, formatRunDuration } from "@/lib/run-fuel";
import type { CalendarEntry, PlanSport } from "@/types";

/** Sessions are data, so they carry the sport's color: runs amber, lifts violet, rides blue. */
export const SPORTS: { key: PlanSport; label: string; color: string }[] = [
  { key: "run", label: "Run", color: "var(--color-activity)" },
  { key: "lift", label: "Lift", color: "var(--color-strength)" },
  { key: "ride", label: "Ride", color: "var(--color-sleep)" },
];
export const SPORT_COLOR: Record<PlanSport, string> = { run: "var(--color-activity)", lift: "var(--color-strength)", ride: "var(--color-sleep)" };

const SPORT_ORDER: Record<PlanSport, number> = { run: 0, lift: 1, ride: 2 };
export const byDoneThenSport = (a: CalendarEntry, b: CalendarEntry) =>
  Number(entryDone(b)) - Number(entryDone(a)) || SPORT_ORDER[entrySport(a)] - SPORT_ORDER[entrySport(b)];

export const dimmed = (e: CalendarEntry) => e.kind === "plan" && (e.state === "skipped" || e.state === "missed");

/** Done = filled with the sport's color; to do = outlined; missed / skipped = grey outline. */
export function markStyle(e: CalendarEntry): CSSProperties {
  const color = dimmed(e) ? "var(--color-text-muted)" : SPORT_COLOR[entrySport(e)];
  return entryDone(e) ? { background: color } : { boxShadow: `inset 0 0 0 1.5px ${color}` };
}

export function entryText(e: CalendarEntry): string {
  if (e.kind === "race" || e.kind === "lift" || e.kind === "plan") return e.label;
  if (e.kind === "ride" && e.planned_distance_km == null) return `Ride ${formatRunDuration(e.planned_duration_min)}`;
  if (e.planned_distance_km != null) return `${e.kind === "ride" ? "Ride" : "Run"} ${formatDistance(e.planned_distance_km)}`;
  return e.label;
}

