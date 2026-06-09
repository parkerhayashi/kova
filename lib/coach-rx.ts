/** Shared progressive-overload logic (Coach + Train). */

export const COACH_UPGRADE_AT_REPS = 8;

export type CoachLog = {
  date: string;
  weight: number;
  reps: number;
};

export type CoachExercise = {
  id: string;
  name: string;
  gym: string;
  day: string;
  repMin: number;
  repMax: number;
  step: number;
  startWeight: number;
  bw?: boolean;
};

export type CoachPrescription = {
  type: "up" | "hold" | "down";
  weight: number;
  reps: number;
  tag: string;
  reason: string;
  bw?: boolean;
};

export function coachEstimate1RM(weight: number, reps: number): number {
  if (reps < 2) return weight;
  return weight * (1 + reps / 30);
}

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Progressive overload prescription from Coach. */
export function getCoachPrescription(
  ex: Pick<CoachExercise, "repMin" | "repMax" | "step" | "bw">,
  logs: CoachLog[],
  upgradeAtReps = COACH_UPGRADE_AT_REPS,
): CoachPrescription | null {
  if (!logs.length) return null;
  const last = logs[logs.length - 1];
  const { weight, reps } = last;
  const { repMin, repMax, step, bw } = ex;
  const upgradeAt = Math.min(upgradeAtReps, repMax);
  let stuck = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].weight === weight) stuck++;
    else break;
  }

  if (bw) {
    if (reps >= upgradeAt) {
      return {
        type: "up",
        weight: 0,
        reps: reps + 1,
        tag: "Push for more",
        reason: `${reps} reps — strong. Push for ${reps + 1} next time.`,
        bw: true,
      };
    }
    if (reps >= repMin) {
      return {
        type: "hold",
        weight: 0,
        reps: reps + 1,
        tag: "Add a rep",
        reason: `${reps} reps. Push for ${reps + 1} next session.`,
        bw: true,
      };
    }
    return {
      type: "hold",
      weight: 0,
      reps: repMin,
      tag: "Repeat",
      reason: `${reps} reps fell short. Repeat until you hit ${repMin}+.`,
      bw: true,
    };
  }

  if (stuck >= 3 && reps < repMin) {
    const dl = roundToStep(weight * 0.9, step);
    return {
      type: "down",
      weight: dl,
      reps: repMax,
      tag: "Deload",
      reason: `Stuck at ${weight} for ${stuck} sessions. Drop 10%, reset, build back cleaner.`,
    };
  }
  if (reps >= upgradeAt) {
    return {
      type: "up",
      weight: weight + step,
      reps: repMin,
      tag: "Add weight",
      reason: `You hit ${reps} reps — time to add ${step}. Expect ${repMin}-${repMin + 1} next session.`,
    };
  }
  if (reps >= repMin && reps < upgradeAt) {
    return {
      type: "hold",
      weight,
      reps: reps + 1,
      tag: "Add a rep",
      reason: `${reps} reps in target. Stay at ${weight}, push for ${reps + 1}.`,
    };
  }
  return {
    type: "hold",
    weight,
    reps: repMin,
    tag: "Repeat",
    reason: `${reps} reps short of ${repMin}-${upgradeAt}. Repeat ${weight} until you hit ${repMin}+ clean.`,
  };
}

export type CoachSplitState = {
  splitRotation: string[];
  splitAnchor: { date: string; index: number };
};

export function getTodaySplit(state: CoachSplitState): {
  name: string;
  index: number;
} {
  try {
    const rot = state.splitRotation;
    if (!rot?.length) return { name: "—", index: 0 };
    const a = new Date(state.splitAnchor.date);
    const t = new Date();
    a.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    const diffDays = Math.round((t.getTime() - a.getTime()) / 86400000);
    const idx =
      (((state.splitAnchor.index + diffDays) % rot.length) + rot.length) %
      rot.length;
    return { name: rot[idx], index: idx };
  } catch {
    return { name: state.splitRotation[0] ?? "—", index: 0 };
  }
}

export function isRestSplit(name: string): boolean {
  return /^rest\b/i.test(name || "");
}

export function formatSplitLabel(name: string): string {
  if (!name) return "—";
  return (isRestSplit(name) ? "REST DAY" : `${name} DAY`).toUpperCase();
}
