// Seed channel_routing rows from docs/channel-routing.json.
// Idempotent: upserts on (channel, external_id) primary key.
// Skips placeholder rows (any external_id starting with REPLACE_ME_).
//
// Usage: node --env-file=.env.local scripts/seed-channel-routing.mjs [--apply]
// Without --apply, prints a dry-run plan.

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const file = path.join(process.cwd(), "docs", "channel-routing.json");

let raw;
try {
  raw = await fs.readFile(file, "utf-8");
} catch {
  console.error(`docs/channel-routing.json not found.`);
  console.error(`Copy docs/channel-routing.example.json to channel-routing.json and edit it.`);
  process.exit(1);
}

const config = JSON.parse(raw);
const routes = (config.routes ?? []).filter(
  (r) => !String(r.external_id ?? "").startsWith("REPLACE_ME_")
);
const skipped = (config.routes ?? []).length - routes.length;

console.log(`docs/channel-routing.json: ${routes.length} ready, ${skipped} placeholders skipped`);
if (routes.length === 0) {
  console.log("nothing to apply.");
  process.exit(0);
}

console.log("\nplan:");
for (const r of routes) {
  console.log(
    `  ${r.channel.padEnd(8)} ${String(r.external_id).padEnd(15)} -> ${r.agent_role.padEnd(8)}` +
      (r.company ? ` company=${r.company}` : "") +
      (r.project ? ` project=${r.project}` : "") +
      (r.notes ? `  // ${r.notes}` : "")
  );
}

if (!apply) {
  console.log("\n(dry run — pass --apply to write to Supabase)");
  process.exit(0);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log("\napplying...");
for (const r of routes) {
  const { error } = await sb.from("channel_routing").upsert(
    {
      channel: r.channel,
      external_id: r.external_id,
      agent_role: r.agent_role,
      company: r.company ?? null,
      project: r.project ?? null,
      notes: r.notes ?? null,
    },
    { onConflict: "channel,external_id" }
  );
  if (error) {
    console.error(`  ERR ${r.channel}/${r.external_id}: ${error.message}`);
  } else {
    console.log(`  OK  ${r.channel}/${r.external_id} -> ${r.agent_role}`);
  }
}

const { count } = await sb
  .from("channel_routing")
  .select("*", { count: "exact", head: true });
console.log(`\nchannel_routing rows in DB: ${count}`);
