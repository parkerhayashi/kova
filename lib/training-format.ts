/**
 * Display helpers for Garmin rides and strength sessions — pure, safe in
 * client components (lib/garmin.ts is server-only).
 */
import { formatRunDuration, kmToMiles } from "@/lib/run-fuel";
import type { GarminActivity } from "@/types";

/** "Indoor cycling", "Road biking"… from Garmin's typeKey. */
export function activityTypeLabel(a: Pick<GarminActivity, "activity_type" | "sport">): string {
  const key = a.activity_type ?? (a.sport === "cycling" ? "cycling" : "strength_training");
  const text = key.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Average speed in mph, when the ride has distance. */
export function rideSpeedMph(a: Pick<GarminActivity, "distance_km" | "duration_min">): number | null {
  if (!a.distance_km || a.duration_min <= 0) return null;
  return Math.round((kmToMiles(a.distance_km) / (a.duration_min / 60)) * 10) / 10;
}

/** One-line ride summary: time · distance · speed · power · HR. */
export function rideQuickStats(a: GarminActivity): string {
  const speed = rideSpeedMph(a);
  return [
    formatRunDuration(a.duration_min),
    a.distance_km ? `${Math.round(kmToMiles(a.distance_km) * 10) / 10} mi` : null,
    speed != null ? `${speed} mph` : null,
    a.avg_power_w != null ? `${Math.round(a.avg_power_w)} W` : null,
    a.avg_hr != null ? `${Math.round(a.avg_hr)} bpm` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What Garmin adds to a Hevy workout: HR · training load · calories. */
export function strengthGarminLine(a: GarminActivity): string {
  return [
    a.avg_hr != null ? `${Math.round(a.avg_hr)} bpm avg` : null,
    a.max_hr != null ? `max ${Math.round(a.max_hr)}` : null,
    a.training_load != null ? `load ${Math.round(a.training_load)}` : null,
    a.calories != null ? `${Math.round(a.calories)} kcal` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
