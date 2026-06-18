# Kova — Personal Health OS

A personal, full-stack health dashboard that unifies data from **Oura Ring,
Hevy, USDA FoodData Central, and Open Food Facts** into a single
interface — surfacing cross-source correlations no individual app can show.

Built for personal use, hosted on Vercel, installable on iPhone as a PWA.

## Stack

| Layer     | Tech                                    |
| --------- | --------------------------------------- |
| Framework | Next.js (App Router) + React 19         |
| Styling   | Tailwind CSS v4 (CSS `@theme` tokens)   |
| Data viz  | Recharts                                |
| Database  | Supabase (Postgres) + Supabase Auth     |
| Mobile    | PWA (manual service worker + manifest)  |
| Hosting   | Vercel (CI/CD + Cron)                   |
| Icons     | Lucide React                            |

> Deviations from the blueprint: uses current stable **Next 16 / Tailwind v4**
> (Node 25 toolchain) instead of Next 14, and a **hand-rolled PWA** instead of
> `next-pwa` (not yet compatible with Next 16). Architecture is unchanged.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + integration credentials
npm run dev
```

Open http://localhost:3000.

### Database

Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql)
in the SQL editor to create all tables and seed the single `user_settings` row.

### Environment

All API credentials live in server-side env vars (see
[`.env.example`](.env.example)) and are never exposed to the browser. Synced
data is cached in Supabase; the frontend always reads from the database rather
than hitting third-party APIs on each load.

## Project layout

```
app/
  (dashboard)/        Today, sleep, recovery, workouts, nutrition,
                      supplements, habits, weight, trends
  api/                sync/*, auth/*, food/*, and native CRUD routes (later phases)
components/           UI primitives, MetricCard, charts, NavBar
lib/                  supabase clients + source-agnostic integrations
                      (oura, hevy, usda, openfoodfacts)
types/                domain types mirroring the DB schema
supabase/schema.sql   full Postgres schema
```

## Build status

- [x] **Phase 1** — Setup & infrastructure
- [x] **Phase 2** — Oura integration + daily summary (home snapshot)
- [x] **Phase 3** — Habits, supplements, weight
- [x] **Phase 4** — Hevy integration
- [x] **Phase 5** — Nutrition logging (USDA, Open Food Facts, capture, restaurants)
- [x] **Phase 6** — Trends & correlations

Cardio comes from Oura activity and Oura workouts — no separate running app integration.

See the project blueprint for original phase detail.

## Design system

Dark monochrome base (`#0E0E0E`) with semantic data accents — recovery green,
sleep blue, activity amber, stress red, nutrition violet. Accent colors appear
**only on data** (metric values, chart lines, dots); all chrome stays
white/gray/black. Tokens live in [`app/globals.css`](app/globals.css).
