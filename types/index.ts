/**
 * Kova domain types — mirror the Supabase schema (blueprint §6).
 * These are the row shapes the frontend reads from the database.
 */

/** Oura intraday sample series (heart rate, HRV during sleep, etc.). */
export interface OuraSample {
  interval: number; // seconds between items
  timestamp: string; // ISO start time
  items: (number | null)[];
}

/** daily_sleep contributors — each in range [1, 100]. */
export interface SleepContributors {
  deep_sleep: number | null;
  efficiency: number | null;
  latency: number | null;
  rem_sleep: number | null;
  restfulness: number | null;
  timing: number | null;
  total_sleep: number | null;
}

/** daily_readiness contributors — each in range [1, 100]. */
export interface ReadinessContributors {
  activity_balance: number | null;
  body_temperature: number | null;
  hrv_balance: number | null;
  previous_day_activity: number | null;
  previous_night: number | null;
  recovery_index: number | null;
  resting_heart_rate: number | null;
  sleep_balance: number | null;
}

/** daily_activity contributors — each in range [1, 100]. */
export interface ActivityContributors {
  meet_daily_targets: number | null;
  move_every_hour: number | null;
  recovery_time: number | null;
  stay_active: number | null;
  training_frequency: number | null;
  training_volume: number | null;
}

/** daily_resilience contributors — each in range [0, 100]. */
export interface ResilienceContributors {
  sleep_recovery: number | null;
  daytime_recovery: number | null;
  stress: number | null;
}

export interface Sleep {
  id: string;
  date: string;
  score: number | null;
  total_sleep_duration: number | null; // seconds
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_duration: number | null;
  efficiency: number | null;
  latency: number | null;
  restfulness: number | null;
  sleep_debt_seconds: number | null;
  average_heart_rate: number | null;
  average_breath: number | null;
  lowest_heart_rate: number | null;
  restless_periods: number | null;
  time_in_bed: number | null;
  bedtime_start: string | null;
  bedtime_end: string | null;
  sleep_phase_5min: string | null;
  movement_30sec: string | null;
  contributors: SleepContributors | null;
  optimal_bedtime_start: number | null; // offset seconds from midnight
  optimal_bedtime_end: number | null;
  bedtime_recommendation: string | null;
  bedtime_status: string | null;
  created_at: string;
}

export interface Readiness {
  id: string;
  date: string;
  score: number | null;
  hrv_balance: number | null;
  body_temperature: number | null;
  recovery_index: number | null;
  resting_heart_rate: number | null;
  cardiovascular_age: number | null;
  resilience_score: number | null;
  temperature_trend_deviation: number | null;
  contributors: ReadinessContributors | null;
  resilience_contributors: ResilienceContributors | null;
  created_at: string;
}

export interface Activity {
  id: string;
  date: string;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  activity_score: number | null;
  stress_score: number | null;
  spo2_avg: number | null;
  vo2_max: number | null;
  equivalent_walking_distance: number | null;
  high_activity_time: number | null;
  medium_activity_time: number | null;
  low_activity_time: number | null;
  sedentary_time: number | null;
  resting_time: number | null;
  non_wear_time: number | null;
  high_activity_met_minutes: number | null;
  medium_activity_met_minutes: number | null;
  low_activity_met_minutes: number | null;
  sedentary_met_minutes: number | null;
  average_met_minutes: number | null;
  target_calories: number | null;
  target_meters: number | null;
  meters_to_target: number | null;
  inactivity_alerts: number | null;
  class_5min: string | null;
  breathing_disturbance_index: number | null;
  recovery_high: number | null;
  stress_summary: string | null;
  contributors: ActivityContributors | null;
  created_at: string;
}

export interface SleepPeriod {
  id: string;
  oura_id: string;
  date: string | null;
  type: string | null;
  bedtime_start: string | null;
  bedtime_end: string | null;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  time_in_bed: number | null;
  efficiency: number | null;
  latency: number | null;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  average_breath: number | null;
  restless_periods: number | null;
  sleep_phase_5min: string | null;
  movement_30sec: string | null;
  heart_rate: OuraSample | null;
  hrv: OuraSample | null;
  created_at: string;
}

export interface HeartRateSample {
  t: string; // ISO timestamp
  bpm: number;
  source: string;
}

export interface HeartRateDaily {
  id: string;
  date: string;
  samples: HeartRateSample[] | null;
  created_at: string;
}

export interface OuraWorkout {
  id: string;
  oura_id: string;
  day: string | null;
  activity: string | null;
  calories: number | null;
  distance: number | null;
  intensity: string | null;
  label: string | null;
  source: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  created_at: string;
}

export interface OuraSession {
  id: string;
  oura_id: string;
  day: string | null;
  type: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  mood: string | null;
  heart_rate: OuraSample | null;
  heart_rate_variability: OuraSample | null;
  motion_count: OuraSample | null;
  created_at: string;
}

export interface OuraTag {
  id: string;
  oura_id: string;
  start_day: string | null;
  end_day: string | null;
  start_time: string | null;
  end_time: string | null;
  tag_type_code: string | null;
  custom_name: string | null;
  comment: string | null;
  created_at: string;
}

export interface OuraProfile {
  id: string;
  age: number | null;
  height: number | null; // meters
  weight: number | null; // kilograms
  biological_sex: string | null;
  email: string | null;
  ring_color: string | null;
  ring_design: string | null;
  ring_firmware_version: string | null;
  ring_hardware_type: string | null;
  ring_size: number | null;
  ring_set_up_at: string | null;
  updated_at: string;
}

export interface WorkoutExercise {
  name: string;
  sets: {
    reps: number | null;
    weight_kg: number | null;
    is_warmup?: boolean;
  }[];
}

export interface Workout {
  id: string;
  hevy_id: string;
  date: string | null;
  title: string | null;
  duration: number | null; // seconds
  volume_kg: number | null;
  exercises: WorkoutExercise[] | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export interface LiftingDashboard {
  period_days: number;
  total_sessions: number;
  total_sets: number;
  total_volume_lbs: number;
  current_streak_days: number;
  volume_by_day: { date: string; label: string; volume_lbs: number }[];
  muscle_split: { category: string; sets: number; volume_lbs: number }[];
}

export type WorkoutTodayStatus = "none" | "completed_today";

export interface WorkoutTodaySummary {
  status: WorkoutTodayStatus;
  title: string | null;
  volume_lbs: number | null;
  duration_seconds: number | null;
  /** Smart caption for home / today tiles. */
  insight: string | null;
  last_session: {
    date: string;
    title: string | null;
    days_ago: number;
  } | null;
  volume_vs_avg_pct: number | null;
  training_streak_days: number | null;
}

export type MealSource =
  | "usda"
  | "open_food_facts"
  | "duke_dining"
  | "restaurant"
  | "saved_meal"
  | "manual"
  | "photo_estimate";

/** How a photo-capture line item was nutrition-sourced. */
export type CaptureMatchSource = "estimated" | "usda" | "restaurant";

/** One editable food line from AI meal capture before logging. */
export interface CaptureItem {
  id: string;
  name: string;
  portion_g: number;
  confidence: number;
  matchSource: CaptureMatchSource;
  food_id?: string;
  nutrients: NutrientProfile["nutrients"];
  notes?: string;
}

/** Result returned by capture / refine APIs. */
export interface CaptureAnalysisResult {
  meal_name: string | null;
  items: CaptureItem[];
}

/** One line item inside a saved meal template. */
export interface SavedMealComponent {
  name: string;
  source?: MealSource;
  food_id?: string;
  serving_size_g?: number;
  servings: number;
  nutrients: Partial<
    Omit<
      Meal,
      | "id"
      | "date"
      | "meal_name"
      | "food_id"
      | "source"
      | "serving_size_g"
      | "servings"
      | "logged_at"
    >
  >;
}

export interface SavedMeal {
  id: string;
  name: string;
  components: SavedMealComponent[];
  sort_order: number;
  created_at: string;
}

export interface Meal {
  id: string;
  date: string;
  meal_name: string | null;
  food_id: string | null;
  source: MealSource | null;
  serving_size_g: number | null;
  servings: number | null;
  // Macros
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  trans_fat_g: number | null;
  // Fiber & sugars
  fiber_g: number | null;
  sugar_g: number | null;
  added_sugar_g: number | null;
  // Micronutrients
  cholesterol_mg: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  magnesium_mg: number | null;
  zinc_mg: number | null;
  selenium_mcg: number | null;
  phosphorus_mg: number | null;
  vitamin_a_mcg: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_mcg: number | null;
  vitamin_e_mg: number | null;
  vitamin_k_mcg: number | null;
  vitamin_b1_mg: number | null;
  vitamin_b2_mg: number | null;
  vitamin_b3_mg: number | null;
  vitamin_b5_mg: number | null;
  vitamin_b6_mg: number | null;
  folate_mcg: number | null;
  vitamin_b12_mcg: number | null;
  // Fatty acids
  omega3_g: number | null;
  omega6_g: number | null;
  monounsaturated_fat_g: number | null;
  polyunsaturated_fat_g: number | null;
  logged_at: string;
}

export interface WeightLog {
  id: string;
  date: string;
  weight_lbs: number;
  body_fat_pct: number | null;
  notes: string | null;
  created_at: string;
}

/** Answers from the Weight-page visual body-fat eye test. */
export type VisualBodyFatAbs = "none" | "faint" | "clear" | "etched";
export type VisualBodyFatVeins = "none" | "arms" | "shoulders" | "widespread";
export type VisualBodyFatFace = "soft" | "some" | "sharp";
export type VisualBodyFatLower = "soft" | "shape" | "clear";

export type VisualBodyFatAnswers = {
  abs: VisualBodyFatAbs;
  veins: VisualBodyFatVeins;
  face: VisualBodyFatFace;
  lower: VisualBodyFatLower;
};

export type VisualBodyFatState = {
  pct: number;
  band_low: number;
  band_high: number;
  answers: VisualBodyFatAnswers;
  sex: "male" | "female" | "other";
  assessed_at: string;
  weight_lbs_at_baseline: number | null;
};

/** Gradual calorie climb after a cut until weight stabilizes near maintenance. */
export type ReverseDietState = {
  active: boolean;
  started_at: string;
  start_weight_lbs: number;
  /** Daily calorie target when reverse started (usually end-of-cut goal). */
  start_calories: number;
  /** Cumulative bumps applied since start. */
  added_kcal: number;
  step_kcal: number;
  review_every_days: number;
  last_review_at: string;
  /** When set, skip bumps until this date (scale rising too fast). */
  hold_until: string | null;
  completed_at: string | null;
};

/** Temporary eat-at-maintenance pause during a cut (no calorie ramp). */
export type DietBreakState = {
  active: boolean;
  started_at: string;
  start_weight_lbs: number;
  /** Planned length in days; null = open-ended. */
  duration_days: number | null;
  /** Inclusive end date when duration_days was set; null if open-ended. */
  ends_on: string | null;
  completed_at: string | null;
};

/**
 * One row per day of standard drinks (alcohol_logs). drinks = 0 means the day
 * was explicitly cleared. The retired habits / habit_logs tables are kept in
 * the schema for history only — the app no longer reads them.
 */
export interface AlcoholLog {
  id: string;
  date: string;
  drinks: number;
  created_at: string;
  updated_at: string;
}

export interface Supplement {
  id: string;
  name: string;
  default_dose: number | null;
  unit: string | null;
  notes: string | null;
  nutrients: Record<string, number> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface SupplementLog {
  id: string;
  supplement_id: string;
  date: string;
  taken: boolean;
  dose_taken: number | null;
  time_taken: string | null;
  notes: string | null;
}

export interface UserSettings {
  id: string;
  sleep_need_hours: number | null;
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
  age: number | null;
  height_m: number | null;
  biological_sex: string | null;
  /** sedentary | light | moderate | high — drives TDEE multiplier (default moderate). */
  activity_level: string | null;
  calorie_goal: number | null;
  protein_goal_g: number | null;
  carbs_goal_g: number | null;
  fat_goal_g: number | null;
  /** Retired — hydration tracking was removed (column kept for history). */
  water_goal_ml: number | null;
  step_goal: number | null;
  timezone: string | null;
  oura_access_token: string | null;
  oura_refresh_token: string | null;
  hevy_api_key: string | null;
  totp_secret: string | null;
  /** Retired — old water/caffeine tracker history (no longer read). */
  water_state: Record<string, unknown> | null;
  client_sync: ClientSyncPayload | null;
  cut_coach_cache: Record<string, unknown> | null;
  adaptive_energy_state: {
    adjustment: number;
    updated_at: string;
    manual?: boolean;
  } | null;
  /** Visual eye-test baseline + answers for rolling body-fat estimate. */
  visual_body_fat_state: VisualBodyFatState | null;
  /** Gradual reverse-diet ramp after a cut. */
  reverse_diet_state: ReverseDietState | null;
  /** Temporary eat-at-maintenance pause during a cut. */
  diet_break_state: DietBreakState | null;
  /** Run fuel carbs per hour beyond the first hour (30–60; null = 45). */
  run_fuel_carbs_per_hour: number | null;
  oura_last_synced_at: string | null;
  hevy_last_synced_at: string | null;
  updated_at: string;
}

/** Resolved body profile used across nutrition and calculations. */
export interface UserProfile {
  age: number | null;
  height_m: number | null;
  biological_sex: string | null;
  /** sedentary | light | moderate | high */
  activity_level: string | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  /** Which fields are explicitly set in user_settings vs inferred from Oura. */
  sources: {
    age: "settings" | "oura" | null;
    height_m: "settings" | "oura" | null;
    biological_sex: "settings" | "oura" | null;
    activity_level: "settings" | null;
    weight_lbs: "weight_log" | "oura" | null;
    body_fat_pct: "weight_log" | "visual" | null;
  };
}

/** Cross-device localStorage snapshots stored in user_settings.client_sync. */
export interface ClientSyncPayload {
  coach?: Record<string, unknown>;
  finances?: Record<string, unknown>;
}

export interface PlaidItem {
  id: string;
  item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  sync_cursor: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialAccount {
  id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  type: string | null;
  subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  iso_currency_code: string | null;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  plaid_transaction_id: string;
  plaid_account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string | null;
  merchant_name: string | null;
  pending: boolean;
  payment_channel: string | null;
  category_primary: string | null;
  category_detailed: string | null;
  personal_finance_category: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normalized full nutrient profile returned by the food-data layer
 * (USDA FoodData Central / Open Food Facts) before it is mapped onto a Meal.
 */
export interface NutrientProfile {
  food_id: string;
  source: MealSource;
  name: string;
  serving_size_g: number;
  nutrients: Partial<
    Omit<
      Meal,
      | "id"
      | "date"
      | "meal_name"
      | "food_id"
      | "source"
      | "serving_size_g"
      | "servings"
      | "logged_at"
    >
  >;
}

// ---------------------------------------------------------------------------
// Running nutrition + Plan Calendar (supabase/schema.sql "Running nutrition")
// Distances are canonical km; durations are minutes.
// ---------------------------------------------------------------------------

export type RunType = "easy" | "long" | "tempo" | "intervals" | "race";
/** Mode 3 events — races only. */
export type RaceEventType = "ten_mile" | "half_marathon" | "marathon";
export type PlannedRunStatus = "planned" | "completed" | "skipped";
export type ActualRunSource = "garmin" | "manual";
export type RunFuelBasis = "planned" | "actual";
export type RunFuelKind = "run_fuel" | "carb_load";

/** The nutrition designation: a Mode 2 fueling run or a Mode 3 race. */
export interface PlannedRun {
  id: string;
  date: string;
  run_type: RunType;
  planned_distance_km: number | null;
  planned_duration_min: number | null;
  /** True when duration was estimated from recent easy pace. */
  duration_estimated: boolean;
  event_type: RaceEventType | null;
  is_race: boolean;
  event_date: string | null;
  designated_at: string | null;
  status: PlannedRunStatus;
  created_at: string;
  updated_at: string;
}

export interface ActualRun {
  id: string;
  planned_run_id: string | null;
  date: string;
  run_type: RunType | null;
  actual_distance_km: number | null;
  actual_duration_min: number;
  started_at: string | null;
  source: ActualRunSource;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One per day, recomputed by the app — never hand-edited. */
export interface RunFuelAdjustment {
  id: string;
  date: string;
  basis: RunFuelBasis;
  kind: RunFuelKind;
  planned_run_id: string | null;
  load_day_index: number | null;
  load_day_count: number | null;
  added_carbs_g: number;
  added_kcal: number;
  added_protein_g: number;
  added_fat_g: number;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  carbs_g_per_kg: number | null;
  basis_duration_min: number | null;
  computed_at: string;
}

/** Gels and other on-run fuel. Counts as intake; never moves targets. */
export interface MidRunIntake {
  id: string;
  date: string;
  planned_run_id: string | null;
  actual_run_id: string | null;
  label: string;
  carbs_g: number;
  kcal: number;
  taken_at_min: number | null;
  logged_at: string;
}

/** One run in the training plan queue — type + mileage, no date. */
export interface TrainingPlanRun {
  id: string;
  position: number;
  run_type: Exclude<RunType, "race">;
  distance_km: number | null;
  duration_min: number | null;
  notes: string | null;
  /** Set once a logged run completes this item; null = still upcoming. */
  actual_run_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CalendarEntryKind = "planned_run" | "race" | "completed_run";
export type CalendarNutritionStatus = "none" | "fueling" | "carb_load";

/** One rendered calendar item — derived from the records above + the plan. */
export interface CalendarEntry {
  id: string;
  date: string;
  kind: CalendarEntryKind;
  run_type: RunType | null;
  planned_distance_km: number | null;
  planned_duration_min: number | null;
  event_type: RaceEventType | null;
  nutrition_status: CalendarNutritionStatus;
  planned_run_id: string | null;
  actual_run_id: string | null;
  label: string;
}
