// Lever 2: model tier-down per cost-transparency review.
// - Content: claude-sonnet-4-6 -> claude-haiku-4-5-20251001 (~80% cheaper output)
// - Dev:     claude-opus-4-7   -> claude-sonnet-4-6         (~80% cheaper output)
//
// Idempotent. Re-running is safe. Usage:
//   node --env-file=.env.local scripts/tier-down-agents.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.anthropic.com/v1";
const BETA = "agent-api-2026-03-01";

const TARGETS = [
  { role: "content", model: "claude-haiku-4-5-20251001", promptFile: "content.md" },
  { role: "dev",     model: "claude-sonnet-4-6",         promptFile: "dev.md" },
];

function h() {
  return {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": BETA,
    "content-type": "application/json",
  };
}

async function getAgent(id) {
  const r = await fetch(`${API_BASE}/agents/${id}`, { headers: h() });
  if (!r.ok) throw new Error(`getAgent ${id}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function updateAgent(id, version, patch) {
  const r = await fetch(`${API_BASE}/agents/${id}`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify({ version, ...patch }),
  });
  if (!r.ok) throw new Error(`updateAgent ${id}: ${r.status} ${await r.text()}`);
  return r.json();
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

for (const spec of TARGETS) {
  const { data: reg, error } = await sb
    .from("agent_registry")
    .select("*")
    .eq("role", spec.role)
    .eq("status", "permanent")
    .maybeSingle();
  if (error || !reg) {
    console.error(`skip ${spec.role}: no registry row (${error?.message ?? "not found"})`);
    continue;
  }

  const current = await getAgent(reg.id);
  const promptPath = path.join(process.cwd(), "src", "agents", spec.promptFile);
  const systemPrompt = await fs.readFile(promptPath, "utf-8");

  const modelChanged = current.model !== spec.model;
  const systemChanged = current.system !== systemPrompt;

  if (!modelChanged && !systemChanged) {
    console.log(`${spec.role.padEnd(8)} already ${spec.model} with current prompt — skip`);
    continue;
  }

  console.log(`${spec.role.padEnd(8)} ${current.model} -> ${spec.model}${systemChanged ? " (+prompt)" : ""}`);
  const updated = await updateAgent(reg.id, current.version, {
    model: spec.model,
    system: systemPrompt,
  });

  await sb
    .from("agent_registry")
    .update({ model: spec.model, system_prompt_template: systemPrompt })
    .eq("id", reg.id);

  console.log(`  -> version=${updated.version} model=${updated.model}`);
}

const { data: roster } = await sb
  .from("agent_registry")
  .select("role, model, status")
  .eq("status", "permanent")
  .order("role");
console.log("\nfinal roster:");
for (const r of roster ?? []) console.log(`  ${r.role.padEnd(10)} ${r.model}`);
