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
  sets: { reps: number | null; weight_kg: number | null }[];
}

export interface Workout {
  id: string;
  hevy_id: string;
  date: string | null;
  title: string | null;
  duration: number | null; // seconds
  volume_kg: number | null;
  exercises: WorkoutExercise[] | null;
  created_at: string;
}

// Native strength tracker (Phase 4). Weights in lbs.
export interface Exercise {
  id: string;
  name: string;
  category: string | null;
  equipment: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  date: string;
  title: string | null;
  notes: string | null;
  duration: number | null; // seconds
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_id: string;
  position: number;
  set_index: number;
  weight_lbs: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
  completed: boolean;
  created_at: string;
}

/** A session's sets grouped by exercise, in logging order. */
export interface SessionExerciseGroup {
  exercise: Exercise;
  position: number;
  sets: WorkoutSet[];
}

export interface Run {
  id: string;
  strava_id: number;
  date: string | null;
  name: string | null;
  distance_m: number | null;
  duration: number | null; // seconds
  avg_pace: number | null;
  avg_hr: number | null;
  elevation_gain: number | null;
  suffer_score: number | null;
  source: string;
  created_at: string;
}

export type MealSource = "usda" | "open_food_facts" | "manual";

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

export interface WaterLog {
  id: string;
  date: string;
  amount_ml: number;
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

export interface Habit {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  completed: boolean;
}

export interface Supplement {
  id: string;
  name: string;
  default_dose: number | null;
  unit: string | null;
  notes: string | null;
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
  calorie_goal: number | null;
  protein_goal_g: number | null;
  carbs_goal_g: number | null;
  fat_goal_g: number | null;
  water_goal_ml: number | null;
  step_goal: number | null;
  timezone: string | null;
  oura_access_token: string | null;
  oura_refresh_token: string | null;
  strava_access_token: string | null;
  strava_refresh_token: string | null;
  hevy_api_key: string | null;
  totp_secret: string | null;
  water_state: Record<string, unknown> | null;
  client_sync: ClientSyncPayload | null;
  updated_at: string;
}

/** Cross-device localStorage snapshots stored in user_settings.client_sync. */
export interface ClientSyncPayload {
  goals?: Record<string, unknown>;
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
