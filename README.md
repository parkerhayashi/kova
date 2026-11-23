# Kova — Personal Health OS

A personal, full-stack health dashboard that pulls a Garmin watch, Hevy
lifting, food logging and weight into one interface — and turns the data into
decisions: how many carbs a long run or a race needs, whether today is a day to
train hard, which habits actually move sleep and recovery.

Built and used daily by one person. Hosted on Vercel, installable on iPhone as
a PWA.

## What it does

- **Home** — sleep score, Body Battery (with overnight HRV and resting HR) and
  steps vs. goal; nutrition rings for all four macros; today's run, workout and
  next race; a daily AI coach for the current cut.
- **Training calendar** — runs, races, lifts and rides on one calendar.
  - Runs import from Garmin (laps, heart-rate zones, pace / HR chart, training
    effect) and de-duplicate against manual and Apple Health copies of the
    same run.
  - Lifts pair Hevy's sets with the Garmin strength session recorded alongside
    (heart rate, training load).
  - Rides (indoor and outdoor) show power, normalized power, TSS and HR.
- **Run fuel & race carb-loading** — long runs and rides add carbs to the day's
  target (estimated from the plan, reconciled to the actual activity); races
  schedule a g/kg carb load with lead-time validation; gels are logged from
  saved products with their own carbs and caffeine.
- **Nutrition** — USDA / Open Food Facts search, restaurant catalogs, saved
  meals, and photo capture (Claude vision) that logs per-ingredient macros.
  Targets adapt from intake and weight trend.
- **Sleep, Body Battery & HRV, Activity** — Garmin's sleep breakdown, HRV vs.
  baseline, Body Battery curve, intensity minutes and stress, with Oura
  history kept from before the switch.
- **Trends** — cross-source correlations (e.g. alcohol → next-day HRV, sleep →
  run pace) and weekly mileage vs. recovery.
- **Muse** — an AI-assistant connector (OpenAPI) that reads the data and can
  make a few scoped writes: update the run plan, log runs, log fuel.

## Stack

| Layer        | Tech                                                    |
| ------------ | ------------------------------------------------------- |
| Framework    | Next.js 16 (App Router) + React 19                      |
| Styling      | Tailwind CSS v4 (CSS `@theme` tokens)                   |
| Data viz     | Recharts                                                |
| Database     | Supabase (Postgres), schema in `supabase/schema.sql`    |
| Mobile       | PWA (hand-rolled service worker + manifest)             |
| Hosting      | Vercel (CI/CD + Cron)                                   |
| Integrations | Garmin Connect Personal API (+ `@garmin/fitsdk`), Hevy, Oura (retired), USDA FoodData Central, Open Food Facts, Claude API |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + integration credentials
npm run db:push              # apply supabase/schema.sql (idempotent)
npm run db:check             # confirm every table is reachable
npm run dev
```

Open http://localhost:3000. Requires Node 25.

### Environment

All credentials are server-side env vars (see [`.env.example`](.env.example)),
never exposed to the browser. Synced data is cached in Supabase; pages read
from the database, not third-party APIs.

The whole app sits behind a single-user password gate (`KOVA_PASSWORD`, with
optional TOTP). Cron routes authenticate with `CRON_SECRET` and refuse every
request in production if it isn't set.

## Project layout

```
app/
  (dashboard)/        home, training, running, cycling, workouts, nutrition,
                      sleep, recovery, activity, weight, trends, settings
  api/                sync/* (cron), muse/* (AI connector), auth, CRUD routes
components/           UI primitives, charts, feature components
lib/                  integrations (garmin, hevy, oura, usda, openfoodfacts),
                      pure domain logic (run fuel, nutrition goals, trends)
lib/data/             Supabase reads / writes per domain
types/                domain types mirroring the DB schema
supabase/schema.sql   full Postgres schema (idempotent)
```

## Design system

Dark-gray base with semantic data accents — recovery green, sleep blue,
activity amber, stress red, nutrition tan. Accent colors appear **only on
data** (metric values, chart lines, dots); all chrome stays monochrome. Tokens
live in [`app/globals.css`](app/globals.css).

## License

All rights reserved — see [LICENSE](LICENSE). The code is public to read, not
licensed for reuse.
