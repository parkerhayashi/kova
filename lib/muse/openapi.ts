const SERVER_URL = "https://kova-os.vercel.app";

const bearer = [{ BearerAuth: [] }];

const daysParam = (def: number, max: number) => ({
  name: "days",
  in: "query" as const,
  required: false,
  schema: { type: "integer", minimum: 1, maximum: max, default: def },
  description: `Trailing window in days (default ${def}, max ${max}).`,
});

export function museOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Kova Muse API",
      version: "1.0.0",
      description:
        "Personal health OS for Parker. Read-only except running writes: replacing the upcoming running plan (PUT /api/muse/running-plan), logging / undoing manual runs (POST, DELETE /api/muse/runs), and logging / undoing on-run fuel like gels (POST, DELETE /api/muse/run-fuel). Also logs injuries / pain check-ins (POST /api/muse/injuries). Bearer token required on every data path. Never sync or request secrets.",
    },
    servers: [{ url: SERVER_URL }],
    security: bearer,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "MUSE_API_TOKEN. Paste into Muse's secure credential store.",
        },
      },
    },
    paths: {
      "/api/muse/today": {
        get: {
          operationId: "getToday",
          summary: "Full picture of today",
          description:
            "Sleep, readiness, activity, meals, macros remaining, alcohol, supplements, workout, diet break / reverse, and cut coach.",
          security: bearer,
          responses: { "200": { description: "Today snapshot" } },
        },
      },
      "/api/muse/oura": {
        get: {
          operationId: "getOura",
          summary: "Oura history",
          description:
            "Sleep, readiness, activity, cardio workouts, meditation/breathing sessions, and tags. Sample waveforms omitted unless samples=1.",
          security: bearer,
          parameters: [
            daysParam(30, 90),
            {
              name: "samples",
              in: "query",
              required: false,
              schema: { type: "integer", enum: [0, 1], default: 0 },
              description: "Set to 1 to include HR/HRV/hypnogram samples.",
            },
          ],
          responses: { "200": { description: "Oura series" } },
        },
      },
      "/api/muse/nutrition": {
        get: {
          operationId: "getNutrition",
          summary: "Nutrition log, goals, supplements, alcohol",
          description:
            "Meals with full macros, daily totals, goals (including diet break / reverse), supplements, saved meals, alcohol calories.",
          security: bearer,
          parameters: [
            daysParam(14, 90),
            {
              name: "date",
              in: "query",
              required: false,
              schema: { type: "string", format: "date" },
              description: "Focus day for goals/totals (default today).",
            },
          ],
          responses: { "200": { description: "Nutrition history" } },
        },
      },
      "/api/muse/body": {
        get: {
          operationId: "getBody",
          summary: "Weight, body fat, profile",
          security: bearer,
          parameters: [daysParam(90, 180)],
          responses: { "200": { description: "Body history" } },
        },
      },
      "/api/muse/training": {
        get: {
          operationId: "getTraining",
          summary: "Hevy lifting",
          description:
            "Recent Hevy workouts with sets, lifting dashboard, and composition snapshot.",
          security: bearer,
          parameters: [
            daysParam(30, 90),
            {
              name: "hevy_limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 80, default: 40 },
            },
          ],
          responses: { "200": { description: "Training history" } },
        },
      },
      "/api/muse/running-plan": {
        get: {
          operationId: "getRunningPlan",
          summary: "Running plan queue + logged runs",
          description:
            "The training plan is an ordered queue of runs (type + miles, no dates). `next` is what Parker should run next. A logged run completes the head of the queue automatically. Also returns runs logged in the window.",
          security: bearer,
          parameters: [daysParam(30, 120)],
          responses: { "200": { description: "Plan and logged runs" } },
        },
        put: {
          operationId: "replaceRunningPlan",
          summary: "Replace the upcoming running plan",
          description:
            "Replaces every upcoming (not yet completed) run with `runs`, in order — the first becomes `next`. Completed runs are never changed. The plan does not change nutrition; Parker designates runs on the calendar himself.",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["runs"],
                  properties: {
                    runs: {
                      type: "array",
                      maxItems: 200,
                      items: {
                        type: "object",
                        required: ["run_type"],
                        properties: {
                          run_type: { type: "string", enum: ["easy", "long", "tempo", "intervals"] },
                          distance_mi: { type: "number", exclusiveMinimum: 0 },
                          duration_min: {
                            type: "number",
                            exclusiveMinimum: 0,
                            description: "Optional; distance_mi or duration_min is required.",
                          },
                          notes: { type: "string", maxLength: 280 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Updated plan" },
            "400": { description: "Invalid payload — nothing was changed" },
          },
        },
      },
      "/api/muse/runs": {
        post: {
          operationId: "logRun",
          summary: "Log a completed run",
          description:
            "Manual run log — same as Parker logging it on the Running page. Matches that day's planned run, reconciles the day's run fuel, and completes the next run in the training plan. Only log runs Parker tells you he did.",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["duration_min"],
                  properties: {
                    date: {
                      type: "string",
                      format: "date",
                      description: "Day the run started (default today). Not in the future.",
                    },
                    duration_min: { type: "number", exclusiveMinimum: 0 },
                    distance_mi: { type: "number", exclusiveMinimum: 0 },
                    run_type: {
                      type: "string",
                      enum: ["easy", "long", "tempo", "intervals", "race"],
                      description: "Optional; defaults to the planned run's type, else easy.",
                    },
                    force: {
                      type: "boolean",
                      description:
                        "Only for a genuinely separate second run that day. Without it, a run matching one already logged (e.g. imported from Apple Health) returns 409.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Logged run, completed plan run, next run, day's run fuel" },
            "400": { description: "Invalid payload — nothing was logged" },
            "409": { description: "A matching run is already logged that day — nothing was logged" },
          },
        },
        delete: {
          operationId: "deleteLoggedRun",
          summary: "Undo a mistaken manual run log",
          description:
            "Deletes a manually logged run by id (from logged_runs in GET /api/muse/running-plan). Its plan run goes back to upcoming and the day's fuel re-reconciles. Garmin runs can't be deleted.",
          security: bearer,
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "400": { description: "Bad id or not a manual run" },
            "404": { description: "Run not found" },
          },
        },
      },
      "/api/muse/run-fuel": {
        get: {
          operationId: "getRunFuel",
          summary: "Saved fuel products + fuel logged on a day",
          description:
            "Parker's saved gels / chews / drink mixes (name, carbs, calories, caffeine) and the fuel already logged against that day's run. `has_run` is false when there's no run to attach fuel to.",
          security: bearer,
          parameters: [
            {
              name: "date",
              in: "query",
              required: false,
              schema: { type: "string", format: "date" },
              description: "Default today. Not in the future.",
            },
          ],
          responses: { "200": { description: "Products and logged fuel" } },
        },
        post: {
          operationId: "logRunFuel",
          summary: "Log gels / chews taken on a run",
          description:
            "Logs fuel against that day's run (logged run first, else the planned run). Name a saved product in `product` to use its carbs, calories and caffeine. For something not saved, send `carbs_g` (and `kcal`, `caffeine_mg` if known). With several saved products and no `product`, returns 400 with the list — ask Parker which. Counts toward the day's intake; never changes targets.",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    date: { type: "string", format: "date", description: "Default today." },
                    product: {
                      type: "string",
                      description: "Name of a saved product (case-insensitive; a unique partial match works).",
                    },
                    count: { type: "integer", minimum: 1, maximum: 10, default: 1 },
                    carbs_g: { type: "number", minimum: 0, description: "Per item, when not using a saved product." },
                    kcal: { type: "number", minimum: 0, description: "Per item; defaults to carbs × 4." },
                    caffeine_mg: { type: "number", minimum: 0 },
                    label: { type: "string", description: "Name for an unsaved item, e.g. \"Banana\"." },
                    taken_at_min: { type: "number", minimum: 0, description: "Minutes into the run." },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Logged items and the day's fuel totals" },
            "400": { description: "Invalid payload or ambiguous fuel — nothing was logged" },
            "404": { description: "Unknown product and no carbs_g given — nothing was logged" },
            "409": { description: "No run that day — log the run first" },
          },
        },
        delete: {
          operationId: "deleteRunFuel",
          summary: "Undo a mistaken fuel log",
          security: bearer,
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Deleted" }, "400": { description: "Bad id" } },
        },
      },
      "/api/muse/injuries": {
        get: {
          operationId: "getInjuries",
          summary: "Active injuries / pain with daily check-ins",
          security: bearer,
          parameters: [{ name: "all", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Include resolved." }],
          responses: { "200": { description: "Injuries" } },
        },
        post: {
          operationId: "logInjury",
          summary: "Log new pain, or check in on an existing injury",
          description:
            "New: body_part, side (left/right/both/none), injury_type, severity 0–10, optional aggravators / symptoms / notes / onset_date. Check-in: injury_id + severity (one per day; re-checking replaces it). Only log what Parker tells you. Unknown body_part / injury_type returns the allowed keys.",
          security: bearer,
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["severity"] } } } },
          responses: { "200": { description: "Logged" }, "400": { description: "Invalid — nothing logged" } },
        },
      },
      "/api/muse/trends": {
        get: {
          operationId: "getTrends",
          summary: "Correlations and dual-axis trends",
          security: bearer,
          parameters: [
            {
              name: "range",
              in: "query",
              required: false,
              schema: { type: "integer", enum: [7, 30, 90], default: 30 },
            },
          ],
          responses: { "200": { description: "Trends payload" } },
        },
      },
      "/api/muse/life": {
        get: {
          operationId: "getLife",
          summary: "Profile, connections, and finances",
          description:
            "Safe profile fields, connection flags, Plaid accounts, month cashflow, and recent transactions. No tokens.",
          security: bearer,
          parameters: [daysParam(30, 90)],
          responses: { "200": { description: "Profile and finance" } },
        },
      },
    },
  };
}

export function museConnectorDocs(origin: string): string {
  return `# Kova × Muse

Kova is Parker's personal health OS (Oura, Hevy, nutrition, weight, finances).
This API is **read-only except running writes**: \`PUT /api/muse/running-plan\`
replaces the upcoming running plan, \`POST\` / \`DELETE /api/muse/runs\` log or
undo a manual run, and \`POST\` / \`DELETE /api/muse/run-fuel\` log or undo gels and
other on-run fuel. Do not attempt any other writes, syncs, or login.

## Auth

Header: \`Authorization: Bearer <token>\`

Paste the token into Muse's secure credential prompt. Never put it in chat.

## How to use

1. Start with \`GET ${origin}/api/muse/today\` for the current day.
2. If you need history, call the domain endpoints below.
3. Prefer today + one domain over fetching everything at once.

## Endpoints

| Path | What it contains |
|---|---|
| \`GET /api/muse/today\` | Sleep, activity and \`garmin.today\` (Body Battery, overnight HRV vs baseline, resting HR, stress, intensity minutes, step goal), meals, remaining macros, alcohol, supplements, workout, diet break / reverse, cut coach |
| \`GET /api/muse/oura?days=30\` | Sleep / activity history (Garmin since Nov 2026, Oura before), \`garmin_daily\` history, plus Oura-era readiness, workouts, sessions, tags. Add \`samples=1\` only if you need waveforms |
| \`GET /api/muse/nutrition?days=14\` | Every logged meal, daily calories/protein, goals, supplements, saved meals, alcohol. Optional \`date=YYYY-MM-DD\` |
| \`GET /api/muse/body?days=90\` | Weight log, rates, body-fat estimate, profile |
| \`GET /api/muse/training?days=30&hevy_limit=40\` | Hevy workouts with sets (plus Garmin heart rate / training load when recorded together), lifting dashboard, composition snapshot, Garmin rides (power, HR, training load) |
| \`GET /api/muse/running-plan?days=30\` | Running plan queue (\`next\`, \`upcoming\`, \`completed\`) + runs logged in the window (Garmin runs include heart rate, splits and training metrics) |
| \`PUT /api/muse/running-plan\` | Replace the upcoming queue: \`{ "runs": [{ "run_type": "easy", "distance_mi": 3, "notes": "…" }] }\` |
| \`POST /api/muse/runs\` | Log a run Parker did: \`{ "date": "YYYY-MM-DD", "duration_min": 32, "distance_mi": 3.1, "run_type": "easy" }\` (date defaults to today) |
| \`DELETE /api/muse/runs?id=<run id>\` | Undo a mistaken manual log (ids are in \`logged_runs\`) |
| \`GET /api/muse/run-fuel?date=YYYY-MM-DD\` | Parker's saved fuel products (carbs / kcal / caffeine) + fuel logged on that day's run |
| \`POST /api/muse/run-fuel\` | Log fuel on a run: \`{ "product": "Maurten 100", "count": 2 }\`, or \`{ "label": "Banana", "carbs_g": 27 }\` for something unsaved |
| \`DELETE /api/muse/run-fuel?id=<fuel id>\` | Undo a mistaken fuel log (ids are in \`logged\`) |
| \`GET /api/muse/injuries\` | Active injuries / pain with daily severity check-ins |
| \`POST /api/muse/injuries\` | Log pain: \`{ \"body_part\": \"knee\", \"side\": \"left\", \"injury_type\": \"dull_ache\", \"severity\": 3 }\`, or check in: \`{ \"injury_id\": \"…\", \"severity\": 2 }\` |
| \`GET /api/muse/trends?range=30\` | Correlations (incl. alcohol → next-day sleep/readiness/HRV/lifting). \`range\` is 7, 30, or 90 |
| \`GET /api/muse/life?days=30\` | Profile, MFA flag, connection status, Plaid accounts + transactions |

OpenAPI: \`${origin}/api/muse/openapi.json\`

## Grounding rules

- Treat this JSON as source of truth over general nutrition advice.
- Calories already include alcohol (~100 kcal/drink) and taken supplements.
- If \`diet_break.active\` is true, the calorie target is maintenance.
- If \`reverse.active\` is true, the calorie target is the reverse ramp, not the cut deficit.
- Running plan: runs are dateless (type + miles). Logging a run completes \`next\` automatically, so after Parker logs runs, re-check the plan and PUT the adjusted queue. The plan never changes nutrition.
- Logging runs: Garmin runs (\`source: "garmin"\`) import automatically and replace any matching Apple Health (\`source: "oura"\`) or manual log. Garmin runs in \`logged_runs\` also carry heart rate, elevation, cadence, \`laps\` (splits) and \`garmin_metrics\` (training effect, training load, VO2 max, HR-zone minutes, running dynamics) — use them when coaching. Check \`logged_runs\` first and only log runs that are missing. Duration is required; ask for it if he didn't say. A 409 means it's already logged — don't force it unless he did two separate runs.
- Logging fuel: gels differ (carbs, calories, caffeine), so log by \`product\` name from \`GET /api/muse/run-fuel\`. If he names one that isn't saved, ask for its carbs (and caffeine) rather than guessing. Fuel attaches to that day's run, so log the run first if it's missing (409). Use \`count\` for several of the same gel.
- Wearable: Parker switched from Oura to Garmin in Nov 2026. Sleep and activity rows carry \`source\`. There is no readiness score anymore; for recovery use Garmin's morning Body Battery (\`body_battery_max\`) and overnight HRV vs its baseline range (\`hrv_status\` is NONE while the baseline forms). Oura readiness is history only.
- Recovery & injuries: \`GET /api/muse/today\` has \`performance\` (Kova's Recovery 0–100 with its components, Strain 0–21, today's advice, fitness / fatigue / form, race predictions) and active \`injuries\`. Respect them when suggesting training: lower-body pain 1–3 → easy running only; 4+ → cross-train or rest; red-flag symptoms → tell Parker to see a professional. Kova isn't medical advice.
- Never request or echo secrets, tokens, passwords, or TOTP.
`;
}
