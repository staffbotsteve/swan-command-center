// One-off migration runner.
// Reads SUPABASE_DB_URL from env (populated by --env-file=.env.local), executes
// the SQL file, verifies the 7 expected tables are present.
//
// Usage:
//   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/0001_v2_schema.sql

import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const EXPECTED_TABLES = [
  "agent_registry",
  "channel_routing",
  "install_log",
  "memories",
  "skill_registry",
  "spawn_log",
  "tasks",
];

const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env.local scripts/apply-migration.mjs <path-to-sql>");
  process.exit(2);
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL not set — did you pass --env-file=.env.local?");
  process.exit(2);
}

const sql = await fs.readFile(path.resolve(file), "utf-8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`connected. applying ${file} ...`);
  await client.query(sql);
  console.log("ok.");

  const { rows } = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name;
  `);
  const present = rows.map((r) => r.table_name);
  console.log("tables:", present.join(", "));

  const missing = EXPECTED_TABLES.filter((t) => !present.includes(t));
  if (missing.length) {
    console.error("MISSING:", missing.join(", "));
    process.exitCode = 1;
  }

  const { rows: seed } = await client.query(`
    select id, role, status from agent_registry order by role;
  `);
  console.log(`seed agents (${seed.length}):`);
  for (const r of seed) console.log(`  ${r.role.padEnd(10)} ${r.status.padEnd(10)} ${r.id}`);
} finally {
  await client.end();
}
