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
-- Hevy: strength workouts (kept for a possible future Hevy import)
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id                    uuid primary key default gen_random_uuid(),
  hevy_id               text unique not null,
  date                  date,
  title                 text,
  duration              int,          -- seconds
  volume_kg             float,
  exercises             jsonb,
  start_time            timestamptz,
  end_time              timestamptz,
  created_at            timestamptz default now()
);

alter table workouts add column if not exists start_time timestamptz;
alter table workouts add column if not exists end_time timestamptz;

-- ---------------------------------------------------------------------------
-- Native strength tracker (Phase 4 — self-logged in Kova). Weights in lbs.
-- ---------------------------------------------------------------------------
create table if not exists exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  category    text,        -- chest | back | legs | shoulders | arms | core | cardio | other
  equipment   text,        -- barbell | dumbbell | machine | cable | bodyweight | other
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create table if not exists workout_sessions (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  title       text,
  notes       text,
  duration    int,         -- seconds (optional)
  created_at  timestamptz default now()
);

create table if not exists workout_sets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references workout_sessions (id) on delete cascade,
  exercise_id uuid not null references exercises (id),
  position    int default 0,   -- exercise order within the session
  set_index   int default 0,   -- set order within the exercise
  weight_lbs  float,
  reps        int,
  rpe         float,
  is_warmup   boolean default false,
  completed   boolean default true,
  created_at  timestamptz default now()
);

create index if not exists workout_sets_session_idx on workout_sets (session_id);
create index if not exists workout_sets_exercise_idx on workout_sets (exercise_id);

-- Saved routines (Hevy-style workout plans)
create table if not exists workout_routines (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table if not exists workout_routine_exercises (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references workout_routines (id) on delete cascade,
  exercise_id   uuid not null references exercises (id),
  position      int not null default 0,
  target_sets   int not null default 2,
  rep_min       int,
  rep_max       int,
  rest_seconds  int default 180,
  notes         text
);

create index if not exists workout_routine_exercises_routine_idx
  on workout_routine_exercises (routine_id);

-- Exercises planned for an in-progress or completed session (supports reorder/replace)
create table if not exists workout_session_exercises (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references workout_sessions (id) on delete cascade,
  exercise_id   uuid not null references exercises (id),
  position      int not null default 0,
  target_sets   int not null default 2,
  rep_min       int,
  rep_max       int,
  rest_seconds  int default 180,
  notes         text
);

create index if not exists workout_session_exercises_session_idx
  on workout_session_exercises (session_id);

alter table workout_sessions
  add column if not exists routine_id uuid references workout_routines (id);

alter table workout_sessions
  add column if not exists status text default 'completed';

alter table workout_sessions
  add column if not exists started_at timestamptz;

alter table workout_sessions
  add column if not exists completed_at timestamptz;

alter table exercises
  add column if not exists exercisedb_id text;

alter table exercises add column if not exists gif_url text;
alter table exercises add column if not exists instructions jsonb;
alter table exercises add column if not exists target_muscle text;
alter table exercises add column if not exists body_part text;
alter table exercises add column if not exists secondary_muscles jsonb;

create unique index if not exists exercises_exercisedb_id_idx
  on exercises (exercisedb_id) where exercisedb_id is not null;

-- Full ExerciseDB catalog (~1500 exercises) for search; synced via scripts/sync-exercisedb.mjs
create table if not exists exercise_catalog (
  exercisedb_id     text primary key,
  name              text not null,
  gif_url           text not null,
  body_part         text,
  equipment         text,
  target_muscle     text,
  secondary_muscles jsonb default '[]'::jsonb,
  instructions      jsonb default '[]'::jsonb,
  category          text,
  synced_at         timestamptz default now()
);

create index if not exists exercise_catalog_name_idx on exercise_catalog (name);

-- Seed a starter exercise library (no-op if a name already exists).
insert into exercises (name, category, equipment) values
  ('Barbell Back Squat', 'legs', 'barbell'),
  ('Barbell Bench Press', 'chest', 'barbell'),
  ('Deadlift', 'back', 'barbell'),
  ('Overhead Press', 'shoulders', 'barbell'),
  ('Barbell Row', 'back', 'barbell'),
  ('Pull-Up', 'back', 'bodyweight'),
  ('Lat Pulldown', 'back', 'cable'),
  ('Incline Dumbbell Press', 'chest', 'dumbbell'),
  ('Dumbbell Shoulder Press', 'shoulders', 'dumbbell'),
  ('Romanian Deadlift', 'legs', 'barbell'),
  ('Leg Press', 'legs', 'machine'),
  ('Leg Curl', 'legs', 'machine'),
  ('Leg Extension', 'legs', 'machine'),
  ('Bicep Curl', 'arms', 'dumbbell'),
  ('Tricep Pushdown', 'arms', 'cable'),
  ('Lateral Raise', 'shoulders', 'dumbbell'),
  ('Cable Fly', 'chest', 'cable'),
  ('Hip Thrust', 'legs', 'barbell'),
  ('Plank', 'core', 'bodyweight'),
  ('Hanging Leg Raise', 'core', 'bodyweight')
on conflict (name) do nothing;

-- Parker's Hevy routines (Push / Pull / Legs) — idempotent by routine name.
insert into exercises (name, category, equipment) values
  ('Incline Bench Press (Dumbbell)', 'chest', 'dumbbell'),
  ('Single Arm Lateral Raise (Cable)', 'shoulders', 'cable'),
  ('Triceps Pushdown', 'arms', 'cable'),
  ('Seated Chest Flys (Cable)', 'chest', 'cable'),
  ('Triceps Dip (Assisted)', 'arms', 'bodyweight'),
  ('Lat Pulldown (Cable)', 'back', 'cable'),
  ('Rear Delt Reverse Fly (Machine)', 'shoulders', 'machine'),
  ('Preacher Curl (Machine)', 'arms', 'machine'),
  ('Seated Cable Row - V Grip (Cable)', 'back', 'cable'),
  ('Single Arm Curl (Cable)', 'arms', 'cable'),
  ('Lying Leg Curl (Machine)', 'legs', 'machine'),
  ('Leg Press (Machine)', 'legs', 'machine'),
  ('Decline Crunch (Weighted)', 'core', 'bodyweight'),
  ('Glute Ham Raise', 'legs', 'bodyweight'),
  ('Leg Extension (Machine)', 'legs', 'machine'),
  ('Seated Calf Raise', 'legs', 'machine')
on conflict (name) do nothing;

insert into workout_routines (name, sort_order) values
  ('Push', 1),
  ('Pull', 2),
  ('Legs', 3)
on conflict (name) do nothing;

insert into workout_routine_exercises (routine_id, exercise_id, position, target_sets, rep_min, rep_max, rest_seconds, notes)
select r.id, e.id, v.position, v.target_sets, v.rep_min, v.rep_max, 180, v.notes
from (values
  ('Push', 'Incline Bench Press (Dumbbell)', 0, 2, 5, 5, null::text),
  ('Push', 'Single Arm Lateral Raise (Cable)', 1, 2, 5, 5, null),
  ('Push', 'Triceps Pushdown', 2, 2, 5, 5, null),
  ('Push', 'Seated Chest Flys (Cable)', 3, 2, 5, 5, null),
  ('Push', 'Triceps Dip (Assisted)', 4, 2, 5, 5, null),
  ('Pull', 'Lat Pulldown (Cable)', 0, 2, 5, 8, null),
  ('Pull', 'Rear Delt Reverse Fly (Machine)', 1, 2, 6, 8, null),
  ('Pull', 'Preacher Curl (Machine)', 2, 2, 4, 8, null),
  ('Pull', 'Seated Cable Row - V Grip (Cable)', 3, 2, 5, 7, null),
  ('Pull', 'Single Arm Curl (Cable)', 4, 2, 6, 6, null),
  ('Legs', 'Lying Leg Curl (Machine)', 0, 2, 6, 7, null),
  ('Legs', 'Leg Press (Machine)', 1, 2, 6, 6, null),
  ('Legs', 'Decline Crunch (Weighted)', 2, 2, 20, 20, '25 lb'),
  ('Legs', 'Glute Ham Raise', 3, 2, 6, 6, '25 lb'),
  ('Legs', 'Leg Extension (Machine)', 4, 2, 20, 20, null),
  ('Legs', 'Seated Calf Raise', 5, 2, 6, 7, null)
) as v(routine_name, exercise_name, position, target_sets, rep_min, rep_max, notes)
join workout_routines r on r.name = v.routine_name
join exercises e on e.name = v.exercise_name
where not exists (
  select 1 from workout_routine_exercises wre
  where wre.routine_id = r.id and wre.position = v.position
);

-- ---------------------------------------------------------------------------
-- Nutrition: meals (USDA / Open Food Facts / manual)
-- ---------------------------------------------------------------------------
create table if not exists meals (
  id                       uuid primary key default gen_random_uuid(),
  date                     date not null,
  meal_name                text,
  food_id                  text,        -- USDA or Open Food Facts ID
  source                   text,        -- 'usda' | 'open_food_facts' | 'duke_dining' | 'restaurant' | 'saved_meal' | 'manual'
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

-- Saved multi-item meal templates (yogurt bowl, Chipotle order, BYO pasta, etc.)
create table if not exists saved_meals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  components  jsonb not null default '[]',
  sort_order  int default 0,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Hydration — RETIRED (Oct 2026). Water/caffeine tracking was removed; the app
-- no longer reads or writes water_logs, user_settings.water_state, or
-- user_settings.water_goal_ml. Kept so logged history isn't lost.
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
-- Habits — RETIRED (Oct 2026). The Habits feature was removed; the app no
-- longer reads or writes these tables. Kept so history isn't lost and so the
-- alcohol_logs backfill below can run. Alcohol now lives in alcohol_logs.
-- ---------------------------------------------------------------------------
create table if not exists habits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'positive',  -- positive = do this; track = log if it happened
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

alter table habits add column if not exists kind text not null default 'positive';

create table if not exists habit_logs (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references habits (id) on delete cascade,
  date        date not null,
  completed   boolean default false,
  unique (habit_id, date)
);

alter table habit_logs add column if not exists amount_tier text;
-- Alcohol: exact drink count as a numeric string ("3"). Legacy buckets ("1-3", "4-6", "6+") still parse.
update habit_logs set amount_tier = '4-6' where amount_tier = '3-6';

-- ---------------------------------------------------------------------------
-- Alcohol — standard drinks per day (logged from Nutrition; ~100 kcal/drink)
-- ---------------------------------------------------------------------------
create table if not exists alcohol_logs (
  id          uuid primary key default gen_random_uuid(),
  date        date unique not null,
  -- 0 = explicitly cleared. Cleared days are kept as rows (not deleted) so the
  -- one-time backfill below can never resurrect them.
  drinks      int not null default 0 check (drinks between 0 and 20),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- One-time backfill from the retired "Alcohol" habit day tag. Legacy range
-- buckets map to the same midpoints the app always used (1-3→2, 4-6→5, 6+→8).
-- `on conflict do nothing` keeps this idempotent and never overwrites a day
-- already edited in alcohol_logs.
insert into alcohol_logs (date, drinks)
select hl.date,
       max(least(20, case
         when hl.amount_tier ~ '^\d+$' then hl.amount_tier::int
         when hl.amount_tier = '1-3' then 2
         when hl.amount_tier in ('3-6', '4-6') then 5
         when hl.amount_tier = '6+' then 8
         else 1
       end))
from habit_logs hl
join habits h on h.id = hl.habit_id
where h.kind = 'track' and h.name ~* 'alcohol' and hl.completed
group by hl.date
on conflict (date) do nothing;

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

alter table supplements add column if not exists nutrients jsonb;

-- ---------------------------------------------------------------------------
-- Settings, goals, and encrypted integration tokens
-- ---------------------------------------------------------------------------
create table if not exists user_settings (
  id                      uuid primary key default gen_random_uuid(),
  sleep_need_hours        float default 8,    -- personal sleep baseline
  weight_goal_lbs         float,
  body_fat_goal_pct       float,  -- target body fat % for macro/calorie adjustment
  age                     int,    -- canonical profile (Oura fills gaps until set)
  height_m                float,    -- meters
  biological_sex          text,     -- male | female | other
  calorie_goal            int,
  protein_goal_g          int,
  carbs_goal_g            int,
  fat_goal_g              int,
  water_goal_ml           int default 3000,  -- retired (hydration removed)
  step_goal               int default 10000,
  timezone                text default 'America/New_York', -- IANA tz; auto-detected from the browser
  oura_access_token       text,   -- encrypted
  oura_refresh_token      text,   -- encrypted
  hevy_api_key            text,   -- encrypted
  totp_secret             text,   -- encrypted; TOTP MFA seed (null = disabled)
  water_state             jsonb,  -- retired: old water/caffeine tracker history
  client_sync             jsonb,  -- goals, coach, finances localStorage snapshots
  oura_last_synced_at     timestamptz,  -- last successful Oura API sync
  updated_at              timestamptz default now()
);

-- Additive: timezone for existing installs.
alter table user_settings
  add column if not exists timezone text default 'America/New_York';

alter table user_settings
  add column if not exists totp_secret text;

alter table user_settings
  add column if not exists water_state jsonb;

alter table user_settings
  add column if not exists client_sync jsonb;

alter table user_settings
  add column if not exists oura_last_synced_at timestamptz;

alter table user_settings
  add column if not exists hevy_last_synced_at timestamptz;

alter table user_settings
  add column if not exists body_fat_goal_pct float;

alter table user_settings
  add column if not exists age int;

alter table user_settings
  add column if not exists height_m float;

alter table user_settings
  add column if not exists cut_coach_cache jsonb;

alter table user_settings
  add column if not exists adaptive_energy_state jsonb;

alter table user_settings
  add column if not exists visual_body_fat_state jsonb;

alter table user_settings
  add column if not exists biological_sex text;

alter table user_settings
  add column if not exists reverse_diet_state jsonb;

alter table user_settings
  add column if not exists diet_break_state jsonb;

alter table user_settings
  add column if not exists activity_level text;

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
-- Plaid — linked bank / credit accounts and transactions (US via Plaid Link)
-- Access tokens are encrypted at rest; sync uses /transactions/sync cursors.
-- ---------------------------------------------------------------------------
create table if not exists plaid_items (
  id                uuid primary key default gen_random_uuid(),
  item_id           text unique not null,
  access_token      text not null,          -- encrypted (lib/crypto)
  institution_id    text,
  institution_name  text,
  sync_cursor       text,                   -- Plaid /transactions/sync cursor
  last_synced_at    timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists financial_accounts (
  id                uuid primary key default gen_random_uuid(),
  plaid_item_id     uuid not null references plaid_items(id) on delete cascade,
  plaid_account_id  text unique not null,
  name              text not null,
  official_name     text,
  type              text,                     -- depository | credit | loan | ...
  subtype           text,                     -- checking | credit card | ...
  mask              text,
  current_balance   numeric,
  available_balance numeric,
  iso_currency_code text default 'USD',
  updated_at        timestamptz default now()
);

create index if not exists financial_accounts_item_idx
  on financial_accounts(plaid_item_id);

create table if not exists financial_transactions (
  id                      uuid primary key default gen_random_uuid(),
  plaid_transaction_id    text unique not null,
  plaid_account_id        text not null,
  amount                  numeric not null, -- Plaid: + = outflow, − = inflow
  iso_currency_code       text default 'USD',
  date                    date not null,
  authorized_date         date,
  name                    text,
  merchant_name           text,
  pending                 boolean default false,
  payment_channel         text,
  category_primary        text,
  category_detailed       text,
  personal_finance_category jsonb,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists financial_transactions_date_idx
  on financial_transactions(date desc);
create index if not exists financial_transactions_account_idx
  on financial_transactions(plaid_account_id);

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The app reads/writes EXCLUSIVELY through createServiceClient() (the
-- service_role key, which bypasses RLS). Enabling RLS with no policies denies
-- the public anon and authenticated keys all row access — so even if the anon
-- key leaks, the data stays locked. Defense-in-depth behind the app password
-- gate (proxy.ts). Re-runnable: enabling RLS twice is a no-op.
-- ---------------------------------------------------------------------------
alter table sleep             enable row level security;
alter table readiness         enable row level security;
alter table activity          enable row level security;
alter table workouts          enable row level security;
alter table exercises         enable row level security;
alter table exercise_catalog  enable row level security;
alter table workout_sessions  enable row level security;
alter table workout_sets      enable row level security;
alter table workout_routines  enable row level security;
alter table workout_routine_exercises enable row level security;
alter table workout_session_exercises enable row level security;
alter table meals             enable row level security;
alter table saved_meals       enable row level security;
alter table water_logs        enable row level security;
alter table weight_log        enable row level security;
alter table habits            enable row level security;
alter table habit_logs        enable row level security;
alter table alcohol_logs      enable row level security;
alter table supplements       enable row level security;
alter table supplement_logs   enable row level security;
alter table user_settings     enable row level security;
alter table sleep_periods     enable row level security;
alter table heart_rate_daily  enable row level security;
alter table oura_workouts     enable row level security;
alter table oura_sessions     enable row level security;
alter table oura_tags         enable row level security;
alter table oura_profile      enable row level security;
alter table plaid_items       enable row level security;
alter table financial_accounts enable row level security;
alter table financial_transactions enable row level security;
