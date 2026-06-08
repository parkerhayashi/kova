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

-- Full Oura coverage: main-night detail, daily_sleep contributors, hypnogram,
-- and sleep_time bedtime guidance (all additive; safe to re-run).
alter table sleep add column if not exists average_heart_rate      float;
alter table sleep add column if not exists average_breath          float;   -- breaths/min
alter table sleep add column if not exists lowest_heart_rate       int;
alter table sleep add column if not exists restless_periods        int;
alter table sleep add column if not exists time_in_bed             int;     -- seconds
alter table sleep add column if not exists bedtime_start           timestamptz;
alter table sleep add column if not exists bedtime_end             timestamptz;
alter table sleep add column if not exists sleep_phase_5min        text;    -- hypnogram (1 deep,2 light,3 rem,4 awake)
alter table sleep add column if not exists movement_30sec          text;
alter table sleep add column if not exists contributors            jsonb;   -- SleepContributors (7)
alter table sleep add column if not exists optimal_bedtime_start   int;     -- offset seconds from midnight
alter table sleep add column if not exists optimal_bedtime_end     int;
alter table sleep add column if not exists bedtime_recommendation  text;
alter table sleep add column if not exists bedtime_status          text;

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

alter table readiness add column if not exists temperature_trend_deviation float;
alter table readiness add column if not exists contributors                jsonb; -- ReadinessContributors (8)
alter table readiness add column if not exists resilience_contributors     jsonb; -- ResilienceContributors (3)

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

alter table activity add column if not exists equivalent_walking_distance float;  -- meters
alter table activity add column if not exists high_activity_time          int;    -- seconds
alter table activity add column if not exists medium_activity_time        int;
alter table activity add column if not exists low_activity_time           int;
alter table activity add column if not exists sedentary_time              int;
alter table activity add column if not exists resting_time                int;
alter table activity add column if not exists non_wear_time               int;
alter table activity add column if not exists high_activity_met_minutes   float;
alter table activity add column if not exists medium_activity_met_minutes float;
alter table activity add column if not exists low_activity_met_minutes    float;
alter table activity add column if not exists sedentary_met_minutes       float;
alter table activity add column if not exists average_met_minutes         float;
alter table activity add column if not exists target_calories             int;
alter table activity add column if not exists target_meters               int;
alter table activity add column if not exists meters_to_target            int;
alter table activity add column if not exists inactivity_alerts           int;
alter table activity add column if not exists class_5min                  text;
alter table activity add column if not exists breathing_disturbance_index float;
alter table activity add column if not exists recovery_high               int;    -- seconds in high-recovery zone
alter table activity add column if not exists stress_summary              text;   -- restored | normal | stressful
alter table activity add column if not exists contributors                jsonb;  -- ActivityContributors (6)

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

-- ---------------------------------------------------------------------------
-- Oura: detailed sleep periods (every period incl. naps; intraday samples)
-- ---------------------------------------------------------------------------
create table if not exists sleep_periods (
  id                    uuid primary key default gen_random_uuid(),
  oura_id               text unique not null,
  date                  date,         -- the `day` the period contributes to
  type                  text,         -- long_sleep | sleep | late_nap | rest | deleted
  bedtime_start         timestamptz,
  bedtime_end           timestamptz,
  total_sleep_duration  int,
  rem_sleep_duration    int,
  deep_sleep_duration   int,
  light_sleep_duration  int,
  awake_time            int,
  time_in_bed           int,
  efficiency            float,
  latency               int,
  average_heart_rate    float,
  lowest_heart_rate     int,
  average_hrv           float,
  average_breath        float,
  restless_periods      int,
  sleep_phase_5min      text,         -- hypnogram string
  movement_30sec        text,
  heart_rate            jsonb,        -- SampleModel { interval, timestamp, items[] }
  hrv                   jsonb,        -- SampleModel
  created_at            timestamptz default now()
);

create index if not exists sleep_periods_date_idx on sleep_periods (date);

-- ---------------------------------------------------------------------------
-- Oura: all-day heart rate (one row per day; samples stored as JSON)
-- ---------------------------------------------------------------------------
create table if not exists heart_rate_daily (
  id          uuid primary key default gen_random_uuid(),
  date        date unique not null,
  samples     jsonb,        -- [{ t: ISO timestamp, bpm: int, source: text }]
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Oura: auto-detected / confirmed workouts (distinct from Hevy `workouts`)
-- ---------------------------------------------------------------------------
create table if not exists oura_workouts (
  id              uuid primary key default gen_random_uuid(),
  oura_id         text unique not null,
  day             date,
  activity        text,
  calories        float,
  distance        float,        -- meters
  intensity       text,         -- easy | moderate | hard
  label           text,
  source          text,         -- manual | autodetected | confirmed | workout_heart_rate
  start_datetime  timestamptz,
  end_datetime    timestamptz,
  created_at      timestamptz default now()
);

create index if not exists oura_workouts_day_idx on oura_workouts (day);

-- ---------------------------------------------------------------------------
-- Oura: guided sessions (meditation, breathing, naps) with intraday samples
-- ---------------------------------------------------------------------------
create table if not exists oura_sessions (
  id                      uuid primary key default gen_random_uuid(),
  oura_id                 text unique not null,
  day                     date,
  type                    text,
  start_datetime          timestamptz,
  end_datetime            timestamptz,
  mood                    text,
  heart_rate              jsonb,
  heart_rate_variability  jsonb,
  motion_count            jsonb,
  created_at              timestamptz default now()
);

create index if not exists oura_sessions_day_idx on oura_sessions (day);

-- ---------------------------------------------------------------------------
-- Oura: tags / enhanced tags (annotations)
-- ---------------------------------------------------------------------------
create table if not exists oura_tags (
  id              uuid primary key default gen_random_uuid(),
  oura_id         text unique not null,
  start_day       date,
  end_day         date,
  start_time      timestamptz,
  end_time        timestamptz,
  tag_type_code   text,
  custom_name     text,
  comment         text,
  created_at      timestamptz default now()
);

create index if not exists oura_tags_start_day_idx on oura_tags (start_day);

-- ---------------------------------------------------------------------------
-- Oura: profile + ring configuration (single row, like user_settings)
-- ---------------------------------------------------------------------------
create table if not exists oura_profile (
  id                      uuid primary key default gen_random_uuid(),
  age                     int,
  height                  float,    -- meters
  weight                  float,    -- kilograms
  biological_sex          text,
  email                   text,
  ring_color              text,
  ring_design             text,
  ring_firmware_version   text,
  ring_hardware_type      text,
  ring_size               int,
  ring_set_up_at          timestamptz,
  updated_at              timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Role grants
-- Supabase doesn't auto-grant on user-created tables in every project setup.
-- service_role is what the server-side sync routes use; authenticated is the
-- signed-in user (single-user app). All statements are idempotent.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
