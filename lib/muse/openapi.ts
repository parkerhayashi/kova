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
        "Personal health OS for Parker. Read-only except one write: replacing the upcoming running plan (PUT /api/muse/running-plan). Bearer token required on every data path. Never sync or request secrets.",
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
This API is **read-only except one write**: \`PUT /api/muse/running-plan\`
replaces the upcoming running plan. Do not attempt any other writes, syncs, or login.

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
| \`GET /api/muse/trends?range=30\` | Correlations (incl. alcohol → next-day sleep/readiness/HRV/lifting). \`range\` is 7, 30, or 90 |
| \`GET /api/muse/life?days=30\` | Profile, MFA flag, connection status, Plaid accounts + transactions |

OpenAPI: \`${origin}/api/muse/openapi.json\`

## Grounding rules

- Treat this JSON as source of truth over general nutrition advice.
- Calories already include alcohol (~100 kcal/drink) and taken supplements.
- If \`diet_break.active\` is true, the calorie target is maintenance.
- If \`reverse.active\` is true, the calorie target is the reverse ramp, not the cut deficit.
- Running plan: runs are dateless (type + miles). Logging a run completes \`next\` automatically, so after Parker logs runs, re-check the plan and PUT the adjusted queue. The plan never changes nutrition.
- Never request or echo secrets, tokens, passwords, or TOTP.
`;
}
