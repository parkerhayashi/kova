/**
 * Insights — pure (client-safe). The weekly report and the links between
 * nutrition and performance. Every finding says how much data it rests on
 * and stays quiet ("needs data") until there's enough to mean something.
 */
import { pearsonR } from "@/lib/trends/correlation";
import { addDays } from "@/lib/utils";

export type Day = string;
export type Series = Map<Day, number>;

// ---------------------------------------------------------------------------
// Weekly report
// ---------------------------------------------------------------------------

export type ReportInput = {
  /** Monday of the week being reported. */
  week: Day;
  today: Day;
  /** Plan sessions in the week (if a plan exists). */
  plan: { sport: "run" | "ride" | "lift"; state: string; kind: string }[] | null;
  /** Load per day (Garmin training load or estimate), all sports. */
  loadByDay: Series;
  /** Fitness (42-day) and form by day. */
  fitnessByDay: Map<Day, { fitness: number; form: number }>;
  recoveryByDay: Series;
  hrvByDay: Series;
  rhrByDay: Series;
  sleepByDay: Series;
  caloriesByDay: Series;
  proteinByDay: Series;
  calorieTarget: number | null;
  proteinTarget: number | null;
  /** Runs done (minutes, km, HR-zone minutes). */
  runs: { date: Day; minutes: number; km: number | null; zones: number[] | null }[];
};

export type WeeklyReport = {
  week: Day;
  /** Days of the week so far (7 once it's over). */
  days: number;
  complete: boolean;
  compliance: { sport: "run" | "ride" | "lift"; done: number; planned: number }[] | null;
  load: { total: number; prev: number | null };
  fitness: { start: number | null; end: number | null; form: number | null };
  recovery: { avg: number | null; prev: number | null; low_days: number };
  hrv: { avg: number | null; prev: number | null };
  rhr: { avg: number | null; prev: number | null };
  sleep: { avg: number | null };
  nutrition: {
    days_logged: number;
    avg_calories: number | null;
    calorie_target: number | null;
    /** Logged days within ±10% of the calorie target. */
    days_on_target: number;
    avg_protein: number | null;
    protein_target: number | null;
    days_protein_hit: number;
  };
  running: { runs: number; minutes: number; km: number; easy_pct: number | null };
  /** Plain-language takeaways, most important first. */
  highlights: string[];
};

const mean = (xs: (number | undefined | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2026-11-25" → "Wed Nov 25". */
export const dayLabel = (d: Day) =>
  `${DOW[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const r0 = (n: number | null) => (n == null ? null : Math.round(n));

export function weeklyReport(input: ReportInput): WeeklyReport {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(input.week, i)).filter((d) => d <= input.today);
  const prevDates = Array.from({ length: 7 }, (_, i) => addDays(input.week, i - 7));
  const pick = (s: Series, ds: Day[]) => ds.map((d) => s.get(d));

  const compliance = input.plan
    ? (["run", "lift", "ride"] as const)
        .map((sport) => {
          const ws = input.plan!.filter((w) => w.sport === sport && w.state !== "skipped" && w.kind !== "race");
          return { sport, done: ws.filter((w) => w.state === "done").length, planned: ws.length };
        })
        .filter((c) => c.planned > 0)
    : null;

  const load = pick(input.loadByDay, dates).reduce<number>((a, b) => a + (b ?? 0), 0);
  // A week in progress compares against the same days of last week.
  const prevLoad = pick(input.loadByDay, prevDates.slice(0, dates.length)).reduce<number>((a, b) => a + (b ?? 0), 0);
  const fitStart = input.fitnessByDay.get(addDays(input.week, -1)) ?? input.fitnessByDay.get(input.week);
  const fitEnd = input.fitnessByDay.get(dates.at(-1) ?? input.week);

  const recovery = pick(input.recoveryByDay, dates);
  const kcal = pick(input.caloriesByDay, dates).filter((v): v is number => v != null && v > 0);
  const protein = pick(input.proteinByDay, dates).filter((v): v is number => v != null && v > 0);
  const tgt = input.calorieTarget;
  const weekRuns = input.runs.filter((r) => dates.includes(r.date));
  const zones = weekRuns.reduce((acc, r) => acc.map((v, i) => v + (r.zones?.[i] ?? 0)), [0, 0, 0, 0, 0]);
  const zoneSum = zones.reduce((a, b) => a + b, 0);

  const report: WeeklyReport = {
    week: input.week,
    days: dates.length,
    complete: dates.length === 7 && addDays(input.week, 6) < input.today,
    compliance,
    load: { total: Math.round(load), prev: prevLoad ? Math.round(prevLoad) : null },
    fitness: { start: r1(fitStart?.fitness ?? null), end: r1(fitEnd?.fitness ?? null), form: r1(fitEnd?.form ?? null) },
    recovery: {
      avg: r0(mean(recovery)),
      prev: r0(mean(pick(input.recoveryByDay, prevDates))),
      low_days: recovery.filter((v) => v != null && v < 45).length,
    },
    hrv: { avg: r0(mean(pick(input.hrvByDay, dates))), prev: r0(mean(pick(input.hrvByDay, prevDates))) },
    rhr: { avg: r1(mean(pick(input.rhrByDay, dates))), prev: r1(mean(pick(input.rhrByDay, prevDates))) },
    sleep: { avg: r0(mean(pick(input.sleepByDay, dates))) },
    nutrition: {
      days_logged: kcal.length,
      avg_calories: r0(mean(kcal)),
      calorie_target: tgt,
      days_on_target: tgt ? kcal.filter((k) => Math.abs(k - tgt) <= tgt * 0.1).length : 0,
      avg_protein: r0(mean(protein)),
      protein_target: input.proteinTarget,
      days_protein_hit: input.proteinTarget ? protein.filter((p) => p >= input.proteinTarget! * 0.95).length : 0,
    },
    running: {
      runs: weekRuns.length,
      minutes: Math.round(weekRuns.reduce((a, r) => a + r.minutes, 0)),
      km: Math.round(weekRuns.reduce((a, r) => a + (r.km ?? 0), 0) * 10) / 10,
      easy_pct: zoneSum >= 30 ? Math.round(((zones[0]! + zones[1]!) / zoneSum) * 100) : null,
    },
    highlights: [],
  };
  report.highlights = highlights(report);
  return report;
}

function highlights(r: WeeklyReport): string[] {
  const out: string[] = [];
  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
  if (r.compliance?.length) {
    const done = r.compliance.reduce((a, c) => a + c.done, 0);
    const planned = r.compliance.reduce((a, c) => a + c.planned, 0);
    out.push(`${done} of ${planned} planned sessions done${r.complete ? "" : " so far"}.`);
  }
  if (r.load.prev && r.load.total) {
    const d = pct(r.load.total, r.load.prev);
    const vs = r.complete ? "last week" : `the same ${r.days} days last week`;
    if (Math.abs(d) >= 10) out.push(`Training load ${d > 0 ? "up" : "down"} ${Math.abs(d)}% on ${vs}${d > 30 ? " — a big jump, watch recovery" : ""}.`);
  }
  if (r.recovery.avg != null && r.recovery.prev != null && Math.abs(r.recovery.avg - r.recovery.prev) >= 5) {
    out.push(`Recovery averaged ${r.recovery.avg} (${r.recovery.avg > r.recovery.prev ? "up" : "down"} from ${r.recovery.prev}).`);
  }
  if (r.recovery.low_days >= 2) out.push(`${r.recovery.low_days} low-Recovery days (under 45).`);
  if (r.rhr.avg != null && r.rhr.prev != null && r.rhr.avg - r.rhr.prev >= 2) {
    out.push(`Resting HR up ${r1(r.rhr.avg - r.rhr.prev)} bpm on last week — fatigue, stress or under-eating can all do this.`);
  }
  if (r.running.easy_pct != null && r.running.easy_pct < 75) {
    out.push(`Only ${r.running.easy_pct}% of running time was easy (Z1–2) — aim for ~80%.`);
  }
  const n = r.nutrition;
  if (n.protein_target && n.days_logged >= 3 && n.days_protein_hit < n.days_logged / 2) {
    out.push(`Protein target hit on ${n.days_protein_hit} of ${n.days_logged} logged days.`);
  }
  if (n.days_logged > 0 && n.days_logged < Math.min(r.days, 5)) out.push(`Food logged on ${n.days_logged} of ${r.days} days.`);
  return out.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Nutrition ↔ performance
// ---------------------------------------------------------------------------

export type InsightStatus = "ok" | "warning" | "needs_data";

export type Insight = {
  id: string;
  title: string;
  status: InsightStatus;
  /** One-sentence finding. */
  finding: string;
  /** How it's measured / what to do. */
  detail: string;
  /** Pairs behind the finding, for a scatter. */
  points?: { label: string; x: number; y: number }[];
  xLabel?: string;
  yLabel?: string;
  r?: number | null;
  /** Rows for list-style insights (long-run fueling). */
  rows?: { label: string; value: string; ok: boolean }[];
};

export type InsightsInput = {
  today: Day;
  caloriesByDay: Series;
  proteinByDay: Series;
  carbsByDay: Series;
  /** Total calories burned per day (Garmin: resting + active). */
  burnByDay: Series;
  /** Exercise calories per day (runs, rides, lifts). */
  exerciseByDay: Series;
  hrvByDay: Series;
  rhrByDay: Series;
  recoveryByDay: Series;
  runs: { date: Day; minutes: number; km: number | null; avg_hr: number | null; type: string | null }[];
  /** Mid-run carbs per day. */
  runCarbsByDay: Series;
  carbsPerHour: number;
  /** For energy availability. */
  weightKg: number | null;
  bodyFatPct: number | null;
  /** Whether a cut (deficit target) is active — EA matters most then. */
  cutting: boolean;
};

const MIN_PAIRS = 8;

function pairInsight(
  base: Pick<Insight, "id" | "title" | "xLabel" | "yLabel">,
  pairs: { label: string; x: number; y: number }[],
  describe: (r: number, slope: number) => { finding: string; status?: InsightStatus },
  detail: string,
  minPairs = MIN_PAIRS,
): Insight {
  if (pairs.length < minPairs) {
    return {
      ...base,
      status: "needs_data",
      finding: `Needs ${minPairs - pairs.length} more day${minPairs - pairs.length === 1 ? "" : "s"} of data (${pairs.length}/${minPairs}).`,
      detail,
      points: pairs,
      r: null,
    };
  }
  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  const r = pearsonR(xs, ys);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = den ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / den : 0;
  const d = r == null ? { finding: "No clear link yet." } : describe(r, slope);
  return { ...base, status: d.status ?? "ok", finding: d.finding, detail, points: pairs, r };
}

const strength = (r: number) => (Math.abs(r) >= 0.5 ? "a clear" : Math.abs(r) >= 0.3 ? "a moderate" : "no meaningful");

export function nutritionInsights(input: InsightsInput): Insight[] {
  const out: Insight[] = [];
  const shortLabel = (d: Day) => dayLabel(d).slice(4);

  // 1. Energy availability (cut safety).
  out.push(energyAvailability(input));

  // 2. Long-run fueling vs target.
  out.push(longRunFueling(input));

  // 3. Carbs the day before vs running efficiency (speed per heartbeat).
  {
    const pairs = input.runs
      .filter((r) => r.km && r.avg_hr && r.minutes >= 15 && input.carbsByDay.has(addDays(r.date, -1)))
      .map((r) => ({
        label: shortLabel(r.date),
        x: Math.round(input.carbsByDay.get(addDays(r.date, -1))!),
        // metres per minute per bpm × 100 — higher = more speed for the same effort
        y: Math.round(((r.km! * 1000) / r.minutes / r.avg_hr!) * 1000) / 10,
      }));
    out.push(
      pairInsight(
        { id: "carbs-efficiency", title: "Carbs the day before → run efficiency", xLabel: "Carbs day before (g)", yLabel: "Efficiency" },
        pairs,
        (r, slope) =>
          Math.abs(r) < 0.3
            ? { finding: `Runs after higher-carb days aren't noticeably more efficient (r ${r.toFixed(2)}).` }
            : {
                finding: `${strength(r)[0]!.toUpperCase()}${strength(r).slice(1)} link: runs after higher-carb days are ${slope > 0 ? "more" : "less"} efficient (r ${r.toFixed(2)}, ~${Math.abs(Math.round(slope * 100 * 10) / 10)} pts per 100 g).`,
              },
        "Efficiency = speed per heartbeat (metres/min ÷ avg HR). Higher means more pace for the same effort. Run/walk sessions count, so compare like with like as they pile up.",
        6,
      ),
    );
  }

  // 4. Calorie deficit vs next-morning HRV and resting HR.
  {
    const deficit = (d: Day) => {
      const burn = input.burnByDay.get(d);
      const eaten = input.caloriesByDay.get(d);
      return burn != null && eaten != null && eaten > 800 ? burn - eaten : null;
    };
    const hrvPairs: Insight["points"] = [];
    const rhrPairs: Insight["points"] = [];
    for (let d = addDays(input.today, -60); d < input.today; d = addDays(d, 1)) {
      const x = deficit(d);
      if (x == null) continue;
      const next = addDays(d, 1);
      const hrv = input.hrvByDay.get(next);
      const rhr = input.rhrByDay.get(next);
      if (hrv != null) hrvPairs.push({ label: shortLabel(d), x: Math.round(x), y: hrv });
      if (rhr != null) rhrPairs.push({ label: shortLabel(d), x: Math.round(x), y: rhr });
    }
    out.push(
      pairInsight(
        { id: "deficit-hrv", title: "Calorie deficit → next-morning HRV", xLabel: "Deficit (kcal)", yLabel: "HRV (ms)" },
        hrvPairs,
        (r, slope) =>
          r < -0.3
            ? {
                finding: `Bigger deficits are followed by lower HRV (r ${r.toFixed(2)}, ~${Math.abs(Math.round(slope * 500))} ms per 500 kcal). Consider smaller deficits on hard training days.`,
                status: "warning",
              }
            : { finding: `Your deficit isn't dragging HRV down (r ${r.toFixed(2)}).` },
        "Deficit = Garmin total burn − calories logged that day (days with under 800 kcal logged are skipped as incomplete).",
      ),
    );
    out.push(
      pairInsight(
        { id: "deficit-rhr", title: "Calorie deficit → next-morning resting HR", xLabel: "Deficit (kcal)", yLabel: "Resting HR" },
        rhrPairs,
        (r, slope) =>
          r > 0.3
            ? {
                finding: `Bigger deficits are followed by a higher resting HR (r ${r.toFixed(2)}, ~${Math.abs(Math.round(slope * 500 * 10) / 10)} bpm per 500 kcal).`,
                status: "warning",
              }
            : { finding: `Resting HR holds steady across your deficits (r ${r.toFixed(2)}).` },
        "A rising resting HR with a bigger deficit is an early sign the cut is costing recovery.",
      ),
    );
  }

  // 5. Protein vs next-day Recovery.
  {
    const pairs: NonNullable<Insight["points"]> = [];
    for (const [d, p] of input.proteinByDay) {
      const rec = input.recoveryByDay.get(addDays(d, 1));
      if (rec != null && p > 0) pairs.push({ label: shortLabel(d), x: Math.round(p), y: rec });
    }
    out.push(
      pairInsight(
        { id: "protein-recovery", title: "Protein → next-day Recovery", xLabel: "Protein (g)", yLabel: "Recovery" },
        pairs.sort((a, b) => a.label.localeCompare(b.label)),
        (r) =>
          r > 0.3
            ? { finding: `Higher-protein days are followed by better Recovery (r ${r.toFixed(2)}).` }
            : { finding: `No clear link between protein and next-day Recovery (r ${r.toFixed(2)}) — protein matters most for muscle, not day-to-day readiness.` },
        "Recovery is Kova's score from HRV, resting HR, sleep and training form.",
      ),
    );
  }
  return out;
}

/**
 * Energy availability = (intake − exercise calories) ÷ fat-free mass, 7-day
 * average of logged days. Under 30 kcal/kg FFM is "low energy availability"
 * (hormones, bone and recovery suffer); 30–45 is a typical cut; 45+ is
 * maintenance-level.
 */
function energyAvailability(input: InsightsInput): Insight {
  const base = { id: "energy-availability", title: "Energy availability" };
  if (!input.weightKg) {
    return { ...base, status: "needs_data", finding: "Needs a recent weigh-in.", detail: "Log weight (or weigh in on Garmin) so Kova can estimate fat-free mass." };
  }
  const bf = input.bodyFatPct ?? 20;
  const ffm = input.weightKg * (1 - bf / 100);
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.today, -(i + 1))).filter((d) => (input.caloriesByDay.get(d) ?? 0) > 800);
  if (days.length < 3) {
    return { ...base, status: "needs_data", finding: `Needs ${3 - days.length} more fully logged day${3 - days.length === 1 ? "" : "s"} this week.`, detail: "Uses the last 7 days with food logged." };
  }
  const values = days.map((d) => ((input.caloriesByDay.get(d) ?? 0) - (input.exerciseByDay.get(d) ?? 0)) / ffm);
  const ea = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const lowDays = values.filter((v) => v < 30).length;
  const detail = `(Food − exercise calories) ÷ fat-free mass (${Math.round(ffm)} kg${input.bodyFatPct == null ? ", assuming 20% body fat" : ` at ${input.bodyFatPct}% body fat`}), over ${days.length} logged days. Under 30 is low energy availability; 30–45 is a normal cut; 45+ is maintenance.`;
  if (ea < 30) {
    return {
      ...base,
      status: "warning",
      finding: `Low: ${ea} kcal/kg FFM (${lowDays} of ${days.length} days under 30). Eat more on training days — especially before long and hard runs.`,
      detail,
      rows: days.map((d, i) => ({ label: dayLabel(d), value: `${Math.round(values[i]!)}`, ok: values[i]! >= 30 })),
    };
  }
  return {
    ...base,
    status: "ok",
    finding: `${ea} kcal/kg FFM — ${ea < 45 ? `a sustainable ${input.cutting ? "cut" : "deficit"}` : "maintenance-level"}${lowDays ? ` (${lowDays} day${lowDays === 1 ? "" : "s"} under 30)` : ""}.`,
    detail,
    rows: days.map((d, i) => ({ label: dayLabel(d), value: `${Math.round(values[i]!)}`, ok: values[i]! >= 30 })),
  };
}

function longRunFueling(input: InsightsInput): Insight {
  const base = { id: "long-run-fuel", title: "Long-run fueling" };
  const fueled = input.runs
    .filter((r) => r.minutes > 75 || (r.minutes > 60 && ["tempo", "intervals", "race"].includes(r.type ?? "")))
    .slice(-6);
  if (!fueled.length) {
    return {
      ...base,
      status: "needs_data",
      finding: "No runs long enough to need fuel yet (over 75 min, or 60 for hard runs).",
      detail: `Kova's target: ${input.carbsPerHour} g carbs/hour after the first hour. Log gels from Running or tell Muse.`,
    };
  }
  const rows = fueled.map((r) => {
    const target = Math.round((Math.max(0, r.minutes - 60) / 60) * input.carbsPerHour);
    const taken = Math.round(input.runCarbsByDay.get(r.date) ?? 0);
    return { label: `${dayLabel(r.date)} · ${Math.round(r.minutes)} min`, value: `${taken} / ${target} g`, ok: taken >= target * 0.8 };
  });
  const hits = rows.filter((r) => r.ok).length;
  return {
    ...base,
    status: hits === rows.length ? "ok" : "warning",
    finding: `Hit your fuel target on ${hits} of ${rows.length} long run${rows.length === 1 ? "" : "s"}.`,
    detail: `Target: ${input.carbsPerHour} g carbs/hour after the first hour (80% counts as a hit).`,
    rows,
  };
}
