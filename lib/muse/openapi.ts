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
        "Personal health OS for Parker. Read-only except running writes: replacing the upcoming running plan (PUT /api/muse/running-plan) and logging / undoing manual runs (POST, DELETE /api/muse/runs). Bearer token required on every data path. Never sync or request secrets.",
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
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Logged run, completed plan run, next run, day's run fuel" },
            "400": { description: "Invalid payload — nothing was logged" },
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
replaces the upcoming running plan, and \`POST\` / \`DELETE /api/muse/runs\` log or
undo a manual run. Do not attempt any other writes, syncs, or login.

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
| \`GET /api/muse/today\` | Sleep, readiness, activity, meals, remaining macros, alcohol, supplements, workout, diet break / reverse, cut coach |
| \`GET /api/muse/oura?days=30\` | Sleep / readiness / activity history, Oura workouts, sessions, tags. Add \`samples=1\` only if you need waveforms |
| \`GET /api/muse/nutrition?days=14\` | Every logged meal, daily calories/protein, goals, supplements, saved meals, alcohol. Optional \`date=YYYY-MM-DD\` |
| \`GET /api/muse/body?days=90\` | Weight log, rates, body-fat estimate, profile |
| \`GET /api/muse/training?days=30&hevy_limit=40\` | Hevy workouts with sets, lifting dashboard, composition snapshot |
| \`GET /api/muse/running-plan?days=30\` | Running plan queue (\`next\`, \`upcoming\`, \`completed\`) + runs logged in the window |
| \`PUT /api/muse/running-plan\` | Replace the upcoming queue: \`{ "runs": [{ "run_type": "easy", "distance_mi": 3, "notes": "…" }] }\` |
| \`POST /api/muse/runs\` | Log a run Parker did: \`{ "date": "YYYY-MM-DD", "duration_min": 32, "distance_mi": 3.1, "run_type": "easy" }\` (date defaults to today) |
| \`DELETE /api/muse/runs?id=<run id>\` | Undo a mistaken manual log (ids are in \`logged_runs\`) |
| \`GET /api/muse/trends?range=30\` | Correlations (incl. alcohol → next-day sleep/readiness/HRV/lifting). \`range\` is 7, 30, or 90 |
| \`GET /api/muse/life?days=30\` | Profile, MFA flag, connection status, Plaid accounts + transactions |

OpenAPI: \`${origin}/api/muse/openapi.json\`

## Grounding rules

- Treat this JSON as source of truth over general nutrition advice.
- Calories already include alcohol (~100 kcal/drink) and taken supplements.
- If \`diet_break.active\` is true, the calorie target is maintenance.
- If \`reverse.active\` is true, the calorie target is the reverse ramp, not the cut deficit.
- Running plan: runs are dateless (type + miles). Logging a run completes \`next\` automatically, so after Parker logs runs, re-check the plan and PUT the adjusted queue. The plan never changes nutrition.
- Logging runs: only log a run Parker says he actually did, once. Check \`logged_runs\` first so you don't log it twice. Duration is required; ask for it if he didn't say.
- Never request or echo secrets, tokens, passwords, or TOTP.
`;
}
