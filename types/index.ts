/**
 * Kova domain types — mirror the Supabase schema (blueprint §6).
 * These are the row shapes the frontend reads from the database.
 */

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
  created_at: string;
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
  oura_access_token: string | null;
  oura_refresh_token: string | null;
  strava_access_token: string | null;
  strava_refresh_token: string | null;
  hevy_api_key: string | null;
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
