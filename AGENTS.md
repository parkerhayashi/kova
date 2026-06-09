<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Kova — project context

**What this is:** Parker's personal health OS. A Next.js + Supabase dashboard that unifies data from Oura Ring, Hevy, Strava, USDA FoodData Central, and Open Food Facts into one interface. Deployed on Vercel, installable on iPhone as a PWA. Single-user, personal use.

**Source of truth:** the full blueprint lives at `~/Downloads/kova_blueprint.pdf` (Personal Health OS — Project Blueprint v2, June 2026). Refer to it whenever a feature, schema field, or design rule is ambiguous.

## Build plan (7 phases)

1. **Setup & infrastructure** — ✅ done (Next.js + Tailwind, Supabase schema, PWA shell, dashboard nav, lib stubs)
2. **Oura integration + Daily Summary** — next up
3. Habits, supplements, weight CRUD
4. Hevy integration
5. Strava integration
6. Nutrition logging (USDA + Open Food Facts)
7. Trends & correlations

When picking up work, default to the next un-checked phase unless the user says otherwise. Each phase's feature list is in blueprint §8.

## Toolchain deviations from the blueprint (intentional)

- **Next.js 16 + React 19 + Tailwind v4** instead of Next 14 — required by the Node 25 toolchain. Design tokens live as CSS `@theme` in `app/globals.css`, not a JS Tailwind config.
- **Hand-rolled PWA** (`public/manifest.json` + `public/sw.js` + `components/ServiceWorkerRegister.tsx`) instead of `next-pwa`, which isn't Next-16-compatible.

Don't "fix" these back to the blueprint's versions.

## Architectural rules

- **All third-party API credentials are server-side only.** Never reference them in client components. Sync jobs run in `app/api/sync/*` route handlers and `lib/supabase/server.ts` `createServiceClient()` is the only thing that touches `SUPABASE_SERVICE_ROLE_KEY`.
- **The frontend reads Supabase, never third-party APIs directly.** Synced data is cached in Postgres so dashboards always read from the DB.
- **Integration modules in `lib/*.ts` are source-agnostic.** Adding or swapping a wearable is one file.
- **Schema is single source of truth.** `supabase/schema.sql` and `types/index.ts` must stay in lockstep.

## Design rules (blueprint §4 — enforce strictly)

- Dark monochrome chrome (`#0E0E0E` bg, `#161616` cards). **No colored chrome — ever.** Active nav state is white text + `rgba(255,255,255,0.08)` background, not an accent color.
- Five semantic accent colors (`--color-recovery`, `--color-sleep`, `--color-activity`, `--color-stress`, `--color-nutrition`) apply **only to data**: metric values, chart lines, indicator dots. Never to buttons, borders, or nav.
- Cards: 0.5px border `rgba(255,255,255,0.07)`, 12px radius, `#161616` background. Use the `.card` class or `<Card>`.
- Charts (Recharts): no gridlines, colored line + soft gradient fill on dark surface, muted axis text.
- Large numbers carry visual weight (`.metric-value`); labels are small, uppercase, muted (`.metric-label`).

## Applying & verifying Supabase

- **Apply schema:** `npm run db:push` runs `supabase/schema.sql` against Postgres directly (idempotent — safe to re-run any time, including after edits). Requires `SUPABASE_DB_URL` in `.env.local` (Dashboard → Project Settings → Database → Connection string → Session pooler). No more pasting SQL into the dashboard by hand.
- **Verify:** `npm run db:check` confirms the connection and that all tables are reachable. Re-run after any schema change.

