// Verifies the supabase-js client + service role key can talk to the live project.
// Usage: node --env-file=.env.local scripts/smoke-supabase.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("env missing");
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, count, error } = await sb
  .from("agent_registry")
  .select("id, role, status", { count: "exact" })
  .order("role");

if (error) {
  console.error("ERROR:", error);
  process.exit(1);
}

console.log(`agent_registry count=${count}`);
for (const row of data ?? []) {
  console.log(`  ${row.role.padEnd(10)} ${row.status.padEnd(10)} ${row.id}`);
}
