-- Kova — Supabase / Postgres schema (blueprint §6)
-- Single-user personal health OS. Run in the Supabase SQL editor.
-- All synced wearable data is upserted by its natural key (date or external id).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Oura: sleep
-- ---------------------------------------------------------------------------
create table if not exists sleep (
  id                    uuid primary key default gen_random_uuid(),
  date                  date unique not null,
  score                 int,
  total_sleep_duration  int,          -- seconds
  rem_sleep_duration    int,
  deep_sleep_duration   int,
  light_sleep_duration  int,
  awake_duration        int,
  efficiency            float,
  latency               int,
  restfulness           int,
  sleep_debt_seconds    int,          -- calculated natively from history
  created_at            timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Oura: readiness
-- ---------------------------------------------------------------------------
create table if not exists readiness (
  id                    uuid primary key default gen_random_uuid(),
  date                  date unique not null,
  score                 int,
  hrv_balance           int,
  body_temperature      float,
  recovery_index        int,
  resting_heart_rate    int,
  cardiovascular_age    int,
  resilience_score      int,
  created_at            timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Oura: activity (steps, calories, stress, spo2, vo2 max)
-- ---------------------------------------------------------------------------
create table if not exists activity (
  id                    uuid primary key default gen_random_uuid(),
  date                  date unique not null,
  steps                 int,
  active_calories       int,
  total_calories        int,
  activity_score        int,
  stress_score          int,
  spo2_avg              float,
  vo2_max               float,
  created_at            timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Hevy: strength workouts
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id                    uuid primary key default gen_random_uuid(),
  hevy_id               text unique not null,
  date                  date,
  title                 text,
  duration              int,          -- seconds
  volume_kg             float,
  exercises             jsonb,
  created_at            timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Strava: runs / cardio
-- ---------------------------------------------------------------------------
create table if not exists runs (
  id                    uuid primary key default gen_random_uuid(),
  strava_id             bigint unique not null,
  date                  date,
  name                  text,
  distance_m            float,
  duration              int,          -- seconds
  avg_pace              float,
  avg_hr                int,
  elevation_gain        float,
  suffer_score          int,
  source                text default 'strava',
  created_at            timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Nutrition: meals (USDA / Open Food Facts / manual)
-- ---------------------------------------------------------------------------
create table if not exists meals (
  id                       uuid primary key default gen_random_uuid(),
  date                     date not null,
  meal_name                text,
  food_id                  text,        -- USDA or Open Food Facts ID
  source                   text,        -- 'usda' | 'open_food_facts' | 'manual'
  serving_size_g           float,
  servings                 float,
  -- Macros
  calories                 float,
  protein_g                float,
  carbs_g                  float,
  fat_g                    float,
  saturated_fat_g          float,
  trans_fat_g              float,
  -- Fiber & sugars
  fiber_g                  float,
  sugar_g                  float,
  added_sugar_g            float,
  -- Micronutrients
  cholesterol_mg           float,
  sodium_mg                float,
  potassium_mg             float,
  calcium_mg               float,
  iron_mg                  float,
  magnesium_mg             float,
  zinc_mg                  float,
  selenium_mcg             float,
  phosphorus_mg            float,
  vitamin_a_mcg            float,
  vitamin_c_mg             float,
  vitamin_d_mcg            float,
  vitamin_e_mg             float,
  vitamin_k_mcg            float,
  vitamin_b1_mg            float,
  vitamin_b2_mg            float,
  vitamin_b3_mg            float,
  vitamin_b5_mg            float,
  vitamin_b6_mg            float,
  folate_mcg               float,
  vitamin_b12_mcg          float,
  -- Fatty acids
  omega3_g                 float,
  omega6_g                 float,
  monounsaturated_fat_g    float,
  polyunsaturated_fat_g    float,
  logged_at                timestamptz default now()
);

create index if not exists meals_date_idx on meals (date);

-- ---------------------------------------------------------------------------
-- Hydration
-- ---------------------------------------------------------------------------
create table if not exists water_logs (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  amount_ml   float not null,
  logged_at   timestamptz default now()
);

create index if not exists water_logs_date_idx on water_logs (date);

-- ---------------------------------------------------------------------------
-- Weight & body composition
-- ---------------------------------------------------------------------------
create table if not exists weight_log (
  id            uuid primary key default gen_random_uuid(),
  date          date unique not null,
  weight_lbs    float not null,
  body_fat_pct  float,
  notes         text,
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------
create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table if not exists habit_logs (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references habits (id) on delete cascade,
  date        date not null,
  completed   boolean default false,
  unique (habit_id, date)
);

-- ---------------------------------------------------------------------------
-- Supplements
-- ---------------------------------------------------------------------------
create table if not exists supplements (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  default_dose  float,
  unit          text,         -- 'mg', 'mcg', 'g', 'IU', 'capsule', 'tablet', etc.
  notes         text,
  is_active     boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

create table if not exists supplement_logs (
  id              uuid primary key default gen_random_uuid(),
  supplement_id   uuid not null references supplements (id) on delete cascade,
  date            date not null,
  taken           boolean default false,
  dose_taken      float,      -- overrides default if different
  time_taken      time,
  notes           text,
  unique (supplement_id, date)
);

-- ---------------------------------------------------------------------------
-- Settings, goals, and encrypted integration tokens
-- ---------------------------------------------------------------------------
create table if not exists user_settings (
  id                      uuid primary key default gen_random_uuid(),
  sleep_need_hours        float default 8,    -- personal sleep baseline
  weight_goal_lbs         float,
  calorie_goal            int,
  protein_goal_g          int,
  carbs_goal_g            int,
  fat_goal_g              int,
  water_goal_ml           int default 3000,
  step_goal               int default 10000,
  oura_access_token       text,   -- encrypted
  oura_refresh_token      text,   -- encrypted
  strava_access_token     text,   -- encrypted
  strava_refresh_token    text,   -- encrypted
  hevy_api_key            text,   -- encrypted
  updated_at              timestamptz default now()
);

-- Single-user app: seed one settings row.
insert into user_settings (id)
select gen_random_uuid()
where not exists (select 1 from user_settings);
