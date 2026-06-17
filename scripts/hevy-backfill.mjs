#!/usr/bin/env node
/**
 * One-time full Hevy history import into Supabase.
 * Usage: node --env-file=.env.local scripts/hevy-backfill.mjs
 */
import { createClient } from "@supabase/supabase-js";

const HEVY_BASE = "https://api.hevyapp.com/v1";
const PAGE_SIZE = 10;
const BATCH = 100;
const LB_PER_KG = 2.2046226218;

const key = process.env.HEVY_API_KEY?.trim();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key || !url || !serviceKey) {
  console.error("Need HEVY_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, serviceKey);

async function hevyFetch(path) {
  const res = await fetch(`${HEVY_BASE}${path}`, {
    headers: { "api-key": key, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hevy ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function volumeKg(exercises) {
  let vol = 0;
  for (const ex of exercises ?? []) {
    for (const set of ex.sets ?? []) {
      if (set.type === "warmup") continue;
      if (set.weight_kg == null || set.reps == null) continue;
      vol += set.weight_kg * set.reps;
    }
  }
  return Math.round(vol * 10) / 10;
}

function normalize(workout, timezone) {
  const start = new Date(workout.start_time);
  const end = new Date(workout.end_time);
  const duration =
    Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
      ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
      : null;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(start);
  return {
    hevy_id: workout.id,
    date,
    title: workout.title?.trim() || null,
    duration,
    volume_kg: volumeKg(workout.exercises),
    exercises: (workout.exercises ?? []).map((ex) => ({
      name: ex.title?.trim() || "Exercise",
      sets: (ex.sets ?? []).map((s) => ({
        reps: s.reps ?? null,
        weight_kg: s.weight_kg ?? null,
      })),
    })),
  };
}

const { data: settingsRow } = await db.from("user_settings").select("id, timezone").limit(1).maybeSingle();
const timezone = settingsRow?.timezone ?? "America/New_York";

const { workout_count: total } = await hevyFetch("/workouts/count");
console.log(`Hevy account: ${total} workouts`);

const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
const rows = [];

for (let page = 1; page <= pageCount; page++) {
  const batch = await hevyFetch(`/workouts?page=${page}&pageSize=${PAGE_SIZE}`);
  for (const w of batch.workouts ?? []) {
    rows.push(normalize(w, timezone));
  }
  process.stdout.write(`\rFetched page ${page}/${pageCount} (${rows.length} workouts)`);
}
console.log("");

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const { error } = await db.from("workouts").upsert(chunk, { onConflict: "hevy_id" });
  if (error) throw error;
  process.stdout.write(`\rUpserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
console.log("");

if (settingsRow?.id) {
  await db
    .from("user_settings")
    .update({ hevy_last_synced_at: new Date().toISOString() })
    .eq("id", settingsRow.id);
}

const { count } = await db.from("workouts").select("*", { count: "exact", head: true });
console.log(`Done — ${count} workouts in database.`);
