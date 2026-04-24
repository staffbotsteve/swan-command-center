// One-off: create the Dev department agent without touching the other 6.
// Non-destructive. Safe to run multiple times (idempotent: skips if a dev
// agent already exists in agent_registry).
//
// Usage: node --env-file=.env.local scripts/add-dev-agent.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.anthropic.com/v1";
const BETA_HEADER = "agent-api-2026-03-01";

const SPEC = {
  role: "dev",
  display: "Dev",
  model: "claude-opus-4-7",
  file: "dev.md",
};

function h() {
  return {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": BETA_HEADER,
    "content-type": "application/json",
  };
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Idempotency check
const { data: existing } = await sb
  .from("agent_registry")
  .select("id, role, status")
  .eq("role", SPEC.role)
  .eq("status", "permanent")
  .maybeSingle();

if (existing) {
  console.log(`dev agent already registered: ${existing.id}`);
  process.exit(0);
}

const systemPrompt = await fs.readFile(
  path.join(process.cwd(), "src", "agents", SPEC.file),
  "utf-8"
);

console.log(`creating ${SPEC.role} (${SPEC.model})...`);
const res = await fetch(`${API_BASE}/agents`, {
  method: "POST",
  headers: h(),
  body: JSON.stringify({
    name: SPEC.display,
    model: SPEC.model,
    system: systemPrompt,
  }),
});

if (!res.ok) {
  console.error(`create failed: ${res.status}`, await res.text());
  process.exit(1);
}

const agent = await res.json();
console.log(`  -> ${agent.id}`);

const { error } = await sb.from("agent_registry").insert({
  id: agent.id,
  role: SPEC.role,
  display_name: SPEC.display,
  model: SPEC.model,
  system_prompt_template: systemPrompt,
  status: "permanent",
});
if (error) {
  console.error(`registry insert failed:`, error.message);
  process.exit(1);
}

const { data: roster } = await sb
  .from("agent_registry")
  .select("id, role, model, status")
  .eq("status", "permanent")
  .order("role");

console.log(`\nroster now has ${roster?.length ?? 0} permanent agents:`);
for (const r of roster ?? []) {
  console.log(`  ${r.role.padEnd(10)} ${r.model.padEnd(30)} ${r.id}`);
}
