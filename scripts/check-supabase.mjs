// Verifies Supabase connectivity and that supabase/schema.sql has been run.
// Run with: node --env-file=.env.local scripts/check-supabase.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("Missing env vars. Check .env.local.");
  process.exit(1);
}

const TABLES = [
  "sleep",
  "readiness",
  "activity",
  "sleep_periods",
  "heart_rate_daily",
  "oura_workouts",
  "oura_sessions",
  "oura_tags",
  "oura_profile",
  "workouts",
  "runs",
  "meals",
  "water_logs",
  "weight_log",
  "habits",
  "habit_logs",
  "supplements",
  "supplement_logs",
  "user_settings",
];

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

let failed = 0;
for (const t of TABLES) {
  const { error, count } = await supabase
    .from(t)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.log(`✗ ${t.padEnd(18)} ${error.message}`);
    failed++;
  } else {
    console.log(`✓ ${t.padEnd(18)} ${count ?? 0} rows`);
  }
}

console.log(
  failed
    ? `\n${failed} table(s) failed — run supabase/schema.sql in the SQL editor.`
    : "\nAll tables reachable. Schema is loaded.",
);
process.exit(failed ? 1 : 0);
