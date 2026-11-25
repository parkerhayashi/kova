/**
 * Injury & pain log — pure helpers (client-safe). An injury's current level is
 * its latest check-in (else the severity at onset). Active injuries lower the
 * Recovery score and, with the plan builder, change training.
 */
import type { Injury, InjuryCheckin } from "@/types";

export const BODY_PARTS: { key: string; label: string; lower: boolean }[] = [
  { key: "foot", label: "Foot", lower: true },
  { key: "toe", label: "Toe", lower: true },
  { key: "heel", label: "Heel / plantar", lower: true },
  { key: "ankle", label: "Ankle", lower: true },
  { key: "achilles", label: "Achilles", lower: true },
  { key: "shin", label: "Shin", lower: true },
  { key: "calf", label: "Calf", lower: true },
  { key: "knee", label: "Knee", lower: true },
  { key: "it_band", label: "IT band", lower: true },
  { key: "hamstring", label: "Hamstring", lower: true },
  { key: "quad", label: "Quad", lower: true },
  { key: "groin", label: "Groin / adductor", lower: true },
  { key: "hip", label: "Hip", lower: true },
  { key: "glute", label: "Glute", lower: true },
  { key: "lower_back", label: "Lower back", lower: true },
  { key: "upper_back", label: "Upper back", lower: false },
  { key: "neck", label: "Neck", lower: false },
  { key: "shoulder", label: "Shoulder", lower: false },
  { key: "chest", label: "Chest / pec", lower: false },
  { key: "elbow", label: "Elbow", lower: false },
  { key: "wrist", label: "Wrist / hand", lower: false },
  { key: "abdomen", label: "Abs / core", lower: false },
  { key: "other", label: "Other", lower: false },
];

export const INJURY_TYPES: { key: string; label: string }[] = [
  { key: "soreness", label: "Soreness / tightness" },
  { key: "dull_ache", label: "Dull ache" },
  { key: "sharp_pain", label: "Sharp pain" },
  { key: "tendon_pain", label: "Tendon pain" },
  { key: "joint_pain", label: "Joint pain" },
  { key: "strain", label: "Strain (muscle)" },
  { key: "sprain", label: "Sprain (ligament)" },
  { key: "shin_splints", label: "Shin splints" },
  { key: "cramp", label: "Cramp / spasm" },
  { key: "blister", label: "Blister / skin" },
  { key: "other", label: "Other" },
];

export const AGGRAVATORS: { key: string; label: string }[] = [
  { key: "running", label: "Running" },
  { key: "downhill", label: "Downhill" },
  { key: "speed", label: "Fast running" },
  { key: "lifting", label: "Lifting" },
  { key: "cycling", label: "Cycling" },
  { key: "walking", label: "Walking" },
  { key: "stairs", label: "Stairs" },
  { key: "sitting", label: "Sitting" },
  { key: "morning", label: "First thing in the morning" },
];

/** Symptoms that mean "see a professional", not "adjust the plan". */
export const RED_FLAGS: { key: string; label: string }[] = [
  { key: "swelling", label: "Swelling" },
  { key: "cant_bear_weight", label: "Can't bear weight" },
  { key: "numbness", label: "Numbness / tingling" },
  { key: "pain_at_rest", label: "Pain at rest or at night" },
  { key: "worsening", label: "Getting worse each day" },
  { key: "changes_stride", label: "Changes how I walk or run" },
];

const label = (list: { key: string; label: string }[], key: string) =>
  list.find((x) => x.key === key)?.label ?? key.replaceAll("_", " ");

export const bodyPartLabel = (key: string) => label(BODY_PARTS, key);
export const injuryTypeLabel = (key: string) => label(INJURY_TYPES, key);
export const aggravatorLabel = (key: string) => label(AGGRAVATORS, key);
export const redFlagLabel = (key: string) => label(RED_FLAGS, key);

export const isLowerBody = (bodyPart: string) =>
  BODY_PARTS.find((b) => b.key === bodyPart)?.lower ?? false;

/** "Left knee", "Lower back". */
export function injuryName(i: Pick<Injury, "body_part" | "side">): string {
  const part = bodyPartLabel(i.body_part);
  if (i.side === "none") return part;
  if (i.side === "both") return `${part} (both)`;
  return `${i.side === "left" ? "Left" : "Right"} ${part.toLowerCase()}`;
}

/** Today's level: the latest check-in, else the severity logged at onset. */
export function currentSeverity(injury: Injury, checkins: InjuryCheckin[]): number {
  const mine = checkins.filter((c) => c.injury_id === injury.id).sort((a, b) => a.date.localeCompare(b.date));
  return mine.at(-1)?.severity ?? injury.severity;
}

/** Any red-flag symptom, or severity 7+ — show "see a professional". */
export function needsProfessional(injury: Injury, severity: number): boolean {
  return severity >= 7 || injury.symptoms.length > 0;
}

/**
 * Recovery points lost to the worst active injury: 2 per severity point for
 * lower-body (it's what running loads), 1 per point elsewhere.
 */
export function injuryPenalty(
  active: { injury: Injury; severity: number }[],
): { points: number; reason: string | null } {
  let worst: { points: number; reason: string } | null = null;
  for (const { injury, severity } of active) {
    const points = severity * (isLowerBody(injury.body_part) ? 2 : 1);
    if (!worst || points > worst.points) {
      worst = { points, reason: `${injuryName(injury)} ${severity}/10` };
    }
  }
  return worst ?? { points: 0, reason: null };
}

/**
 * Training guidance for an active injury (used by the Today card now and the
 * plan builder in Phase 2). Not medical advice.
 */
export function injuryGuidance(injury: Injury, severity: number): string {
  if (needsProfessional(injury, severity)) {
    return "Get this checked by a physio or doctor before training on it.";
  }
  if (!isLowerBody(injury.body_part)) {
    return severity >= 4
      ? "Skip lifts that load it; running is fine if it doesn't hurt."
      : "Train as planned; avoid exercises that aggravate it.";
  }
  if (severity >= 4) return "Swap runs for low-impact cross-training (bike) until it settles.";
  if (severity >= 1) return "Easy running only — no speed work, hold mileage flat.";
  return "Pain-free: build back gradually.";
}
