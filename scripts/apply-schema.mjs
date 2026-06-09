/**
 * Apply supabase/schema.sql directly to the Postgres database.
 *
 * The schema is fully idempotent (create table if not exists / add column if
 * not exists / on conflict do nothing), so this is safe to run any time —
 * after editing the schema, on a fresh database, or just to be sure.
 *
 * Requires a direct Postgres connection string in SUPABASE_DB_URL (or
 * DATABASE_URL). Grab it from the Supabase dashboard:
 *   Project Settings → Database → Connection string → "Session pooler"
 * and paste the URI (with your DB password) into .env.local.
 *
 * Usage:  npm run db:push
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "supabase", "schema.sql");

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "Missing SUPABASE_DB_URL.\n" +
      "Add it to .env.local — copy it from the Supabase dashboard:\n" +
      "  Project Settings → Database → Connection string → Session pooler\n" +
      "Example: SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres",
  );
  process.exit(1);
}

const sql = await readFile(schemaPath, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected. Applying supabase/schema.sql…");
  await client.query(sql);
  console.log("✓ Schema applied successfully.");
} catch (err) {
  console.error("✗ Failed to apply schema:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
