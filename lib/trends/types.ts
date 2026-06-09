import type { Accent } from "@/lib/utils";
import type { ScatterPoint } from "@/lib/trends/correlation";
import type {
  Activity,
  HabitLog,
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
  habitLogs: HabitLog[];
  habitCount: number;
  supplementLogs: SupplementLog[];
  supplementCount: number;
  workouts: OuraWorkout[];
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
}

export interface TrendsPayload {
  range: TrendRange;
  ouraConnected: boolean;
  correlations: CorrelationView[];
  dualTrends: DualTrendView[];
  comingSoon: { title: string; reason: string }[];
}
