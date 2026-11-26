<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kova — project context

**What this is:** Parker's personal health OS — a Next.js + Supabase dashboard deployed on Vercel (`kova-os.vercel.app`) and installed on iPhone as a PWA. Single-user, personal use. Data sources:

- **Garmin** (Personal API — pull-only, read-only): runs, rides, strength sessions, sleep, HRV, Body Battery, steps, weigh-ins, HR zones. Syncs when the app opens (`after()` in `app/(dashboard)/layout.tsx`, 15-min throttle) plus a daily cron. Kova **cannot** push workouts to the watch.
- **Hevy** (lifting): webhook `app/api/hevy/webhook` (bearer `HEVY_WEBHOOK_SECRET`) + daily cron / on-open sync.
- **USDA FoodData Central + Open Food Facts** (nutrition logging), **Plaid** (finances).
- **Muse** — Parker's AI assistant — reads (and in a few places writes) through `app/api/muse/*`; spec in `lib/muse/openapi.ts`.
- **Oura is retired** (Nov 2026): history stays, nothing syncs. Strava was dropped.

**Source of truth:** the original blueprint is `~/Downloads/kova_blueprint.pdf` (v2, June 2026), but the app has gone well past it. Where the code or this file disagree with the blueprint, they win.

## What's built

- **Blueprint phases 1–6** — setup, daily summary, habits / supplements / weight, Hevy, nutrition, trends — done.
- **Running nutrition** — run fuel, race carb load, races (custom distances, names), gels / fuel products (`lib/run-fuel.ts`, `lib/data/running.ts`).
- **Garmin replaces Oura** for sleep, recovery and activity (`lib/garmin.ts`, `lib/data/garmin.ts`, `garmin_daily`).
- **Training** (Nov 2026, three phases):
  1. **Performance** — `lib/performance.ts`, `lib/data/performance.ts`: load, fitness / fatigue / form, Recovery + Strain, race predictions, pace zones; injury log (`lib/injuries.ts`).
  2. **Training plan** — `lib/plan-engine.ts` (generate + `scheduleWeek`), `lib/plan-adapt.ts` (`reconcile` = automatic, `proposeChanges` = suggestions), `lib/data/plan.ts`, `lib/plan-review.ts` (weekly Claude review, Mondays). UI on `/training` (`components/training/PlanCard.tsx`).
  3. **Insights** — `lib/insights.ts`, `lib/data/insights.ts`, `/insights`: weekly report + nutrition ↔ performance; Recovery / Strain correlations in Trends.

## How the training plan works (Parker's calls — don't regress them)

- **Weekly targets, not weekdays.** Each week has N runs / lifts / rides. Dates are only pencilled in and re-plan whenever Training loads or Garmin syncs. Anything logged in a week checks off that week's sessions (lifts by Push / Pull / Legs from the Hevy title); a session is only "missed" once its week is over. Parker trains whenever there's time, often a run and a lift the same day, and rarely takes full rest days — rest is suggested only when Recovery, ramp rate or pain call for it. Long runs of 60+ min prefer the weekend.
- **Lifts are Push / Pull / Legs**, legs once a week by default (running already loads the legs).
- **The run/walk progression is used exactly as queued** (`training_plan_runs`): queued minutes as straight rounds (42 min at 5:1 = 7 × 5/1). Leftover run/walk sessions carry forward in order. **No warm-ups or cool-downs anywhere in the plan.**
- Workouts logged before the plan's start date don't count toward it.
- **Automatic vs. suggested:** following what was logged is automatic (stored as `plan_suggestions` with `source: 'auto'`, listed on the plan card). Judgment calls — injury, pain, ramp rate, the AI review — are Accept / Dismiss. The AI review never moves dates.
- Muse can read the plan (`GET /api/muse/running-plan` → `dated_plan`) but can't replace it while one is active (`PUT` returns 409).

## Working rules

- **Never run write tests against live data** (plan, runs, logs). Test pure functions, or dry-run (`reconcilePlan({ dryRun: true })`). Opening `/training` on the dev server runs `reconcilePlan()` for real, and so does any page load that triggers a Garmin sync — both write.
- **Secrets:** never print or log secret values; check env var *names* only. Parker signs in to Kova themselves — never enter the password or TOTP.
- **Scripts:** run TypeScript against real data with jiti, e.g. `JITI_ALIAS='{"@/":"<repo>/","@garmin/fitsdk":"<repo>/node_modules/@garmin/fitsdk/src/index.js","fflate":"<repo>/node_modules/fflate"}' node --env-file=.env.local node_modules/.bin/jiti <file>` (Node 25).
- **Commits:** only the files for the change; `.claude/`, `.cursor/` and `scripts/test-*.ts` stay untracked.

## Toolchain deviations from the blueprint (intentional)

- **Next.js 16 + React 19 + Tailwind v4** instead of Next 14 — required by the Node 25 toolchain. Design tokens live as CSS `@theme` in `app/globals.css`, not a JS Tailwind config.
- **Hand-rolled PWA** (`public/manifest.json` + `public/sw.js` + `components/ServiceWorkerRegister.tsx`) instead of `next-pwa`, which isn't Next-16-compatible.

Don't "fix" these back to the blueprint's versions.

## Architectural rules

- **All third-party API credentials are server-side only.** Never reference them in client components. Sync jobs run in `app/api/sync/*` route handlers and `lib/supabase/server.ts` `createServiceClient()` is the only thing that touches `SUPABASE_SERVICE_ROLE_KEY`.
- **The frontend reads Supabase, never third-party APIs directly.** Synced data is cached in Postgres so dashboards always read from the DB.
- **Integration modules in `lib/*.ts` are source-agnostic.** Adding or swapping a wearable is one file.
- **Schema is single source of truth.** `supabase/schema.sql` and `types/index.ts` must stay in lockstep.
- **Auth:** `proxy.ts` gates everything behind the session except the public pages, the cron routes in `CRON_PATHS` and the Hevy webhook. Cron routes check `CRON_SECRET` via `lib/cron-auth.ts` (fails closed in production); Muse routes check `MUSE_API_TOKEN`.

## Branding

**Source:** `docs/branding/guide/Kova_Brand_Guidelines.pdf` (v1.0 · 2026). Drop updates in `docs/branding/incoming/` → `npm run branding:apply`.

**Logo usage:** Mark *or* Wordmark per surface — never both (`<KovaMark>` / `<KovaWordmark>` in `components/brand/`). Wordmark is custom letterforms; never re-type "Kova" in another font.

**Colors (brand):** Kova Black `#000000`, Kova White `#FFFFFF`, Muted `#6B7280`, Border `#E5E7EB`, Surface `#F9FAFB` (light contexts). Dark app chrome uses **dark grays, not pure black** (Parker's call, Oct 2026): background `#161618`, cards `#1f1f22`, raised `#2a2a2e`, muted text `#8b909a` (brand muted lightened for contrast on gray). Tokens live in `app/globals.css` `@theme` — use them, don't hard-code blacks. Camera/photo viewers stay black.

**Type:** Inter — Bold headings, SemiBold subheadings/labels, Regular body (`app/layout.tsx`).

**Icons:** Primary app icon = black rounded square + white mark (`public/icons/icon.svg`). Assets in `public/brand/`.

## Design rules (enforce strictly)

- Monochrome chrome per brand. **No colored chrome — ever.** Active nav: white text + `rgba(255,255,255,0.07)` fill, not an accent color.
- Five semantic accent colors (`--color-recovery`, `--color-sleep`, `--color-activity`, `--color-stress`, `--color-nutrition`) apply **only to data**: metric values, chart lines, indicator dots. Never to buttons, borders, or nav.
- Training sessions use sport colors (data too): runs `--color-activity`, rides `--color-sleep`, lifts `--color-strength`. Done = filled, to do = outlined.
- Cards: brand border tokens, 16px radius, `--color-surface` (`#1f1f22`). Use `.card` or `<Card>`.
- Charts (Recharts): no gridlines, colored line + soft gradient fill on dark surface, muted axis text.
- Large numbers carry visual weight (`.metric-value`); labels are small, uppercase, muted (`.metric-label`).

## Applying & verifying Supabase

- **Apply schema:** `npm run db:push` runs `supabase/schema.sql` against Postgres directly (idempotent — safe to re-run any time, including after edits). Requires `SUPABASE_DB_URL` in `.env.local` (Dashboard → Project Settings → Database → Connection string → Session pooler). No more pasting SQL into the dashboard by hand.
- **Verify:** `npm run db:check` confirms the connection and that all tables are reachable. Re-run after any schema change.

