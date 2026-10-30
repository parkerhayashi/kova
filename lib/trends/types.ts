import type { Accent } from "@/lib/utils";
import type { ScatterPoint } from "@/lib/trends/correlation";
import type {
  ActualRun,
  Activity,
  OuraWorkout,
  Readiness,
  Sleep,
  SupplementLog,
  WeightLog,
} from "@/types";

export type TrendRange = 7 | 30 | 90;

export interface TrendsInput {
  sleep: Sleep[];
  readiness: Readiness[];
  activity: Activity[];
  weight: WeightLog[];
  /** Standard drinks per day (days with ≥ 1 drink only). */
  alcoholDrinksByDay: Map<string, number>;
  supplementLogs: SupplementLog[];
  supplementCount: number;
  workouts: OuraWorkout[];
  /** Hevy lifting volume by day (lb). */
  liftingVolumeByDay: Map<string, number>;
  /** Daily protein totals (meals + supplements), keyed by date. */
  proteinByDay: Map<string, number>;
  /** Daily calorie totals (meals + supplements), keyed by date. */
  caloriesByDay: Map<string, number>;
  /** Logged / imported runs in the range. */
  runs: ActualRun[];
  today: string;
}

export interface CorrelationView {
  id: string;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  xAccent: Accent;
  yAccent: Accent;
  points: ScatterPoint[];
  r: number | null;
  minPairs: number;
}

export interface DualTrendView {
  id: string;
  title: string;
  subtitle: string;
  labels: string[];
  primary: (number | null)[];
  secondary: (number | null)[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryAccent: Accent;
  secondaryAccent: Accent;
  primaryAsBars?: boolean;
  emptyHint?: string;
}

export interface RunningTrends {
  summary: {
    runs: number;
    miles: number;
    avg_pace_min_per_mile: number | null;
    longest_miles: number | null;
    longest_date: string | null;
  };
  trends: DualTrendView[];
  correlations: CorrelationView[];
}

export interface TrendsPayload {
  range: TrendRange;
  ouraConnected: boolean;
  running: RunningTrends;
  correlations: CorrelationView[];
  dualTrends: DualTrendView[];
  comingSoon: { title: string; reason: string }[];
}
