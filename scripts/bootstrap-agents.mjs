// Destructive bootstrap: archives ALL existing Managed Agents, then creates
// the 6 permanent department agents using the system prompts in src/agents/*.md
// and upserts real Anthropic agent IDs into agent_registry (replacing seed_*).
//
// Requires:  --yes flag. Refuses without it.
// Usage:     node --env-file=.env.local scripts/bootstrap-agents.mjs --yes

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.anthropic.com/v1";
const BETA_HEADER = "agent-api-2026-03-01";

function h() {
  return {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": BETA_HEADER,
    "content-type": "application/json",
  };
}

const SPECS = [
  { role: "main",     display: "Main",     model: "claude-haiku-4-5-20251001", file: "main.md" },
  { role: "research", display: "Research", model: "claude-sonnet-4-6",         file: "research.md" },
  { role: "comms",    display: "Comms",    model: "claude-sonnet-4-6",         file: "comms.md" },
  { role: "content",  display: "Content",  model: "claude-sonnet-4-6",         file: "content.md" },
  { role: "ops",      display: "Ops",      model: "claude-sonnet-4-6",         file: "ops.md" },
  { role: "legal",    display: "Legal",    model: "claude-opus-4-7",           file: "legal.md" },
];

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes flag.");
  console.error("This archives ALL existing Managed Agents and creates 6 new ones.");
  console.error("Run scripts/bootstrap-preview.mjs first to see what will happen.");
  process.exit(2);
}

async function listAllAgents() {
  const out = [];
  let url = `${API_BASE}/agents?limit=100`;
  while (url) {
    const res = await fetch(url, { headers: h() });
    if (!res.ok) throw new Error(`list: ${res.status} ${await res.text()}`);
    const data = await res.json();
    out.push(...(data.data ?? data.agents ?? []));
    url = data.has_more && data.next_page
      ? `${API_BASE}/agents?limit=100&after=${data.next_page}`
      : "";
  }
  return out;
}

async function archiveAgent(id) {
  const res = await fetch(`${API_BASE}/agents/${id}`, { method: "DELETE", headers: h() });
  if (!res.ok && res.status !== 404) {
    throw new Error(`archive ${id}: ${res.status} ${await res.text()}`);
  }
}

async function createAgent({ name, model, system }) {
  const res = await fetch(`${API_BASE}/agents`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify({ name, model, system }),
  });
  if (!res.ok) throw new Error(`create ${name}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── 1. Archive everything ────────────────────────────────────────────────

const existing = await listAllAgents();
console.log(`archiving ${existing.length} existing agents...`);
for (const a of existing) {
  await archiveAgent(a.id);
  process.stdout.write(".");
}
console.log(`\n  done.`);

// ─── 2. Create 6 department agents ────────────────────────────────────────

const agentDir = path.join(process.cwd(), "src", "agents");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log(`\ncreating department agents...`);
for (const spec of SPECS) {
  const system = await fs.readFile(path.join(agentDir, spec.file), "utf-8");
  const agent = await createAgent({ name: spec.display, model: spec.model, system });
  console.log(`  ${spec.role.padEnd(10)} ${agent.id}`);

  // Replace seed row with real agent row.
  await sb.from("agent_registry").delete().eq("id", `seed_${spec.role}`);
  const { error } = await sb.from("agent_registry").insert({
    id: agent.id,
    role: spec.role,
    display_name: spec.display,
    model: spec.model,
    system_prompt_template: system,
    status: "permanent",
  });
  if (error) {
    console.error(`    WARN: registry upsert failed for ${spec.role}:`, error.message);
  }
}

// ─── 3. Verify ────────────────────────────────────────────────────────────

const { data: registry } = await sb
  .from("agent_registry")
  .select("id, role, model, status")
  .eq("status", "permanent")
  .order("role");

console.log(`\nagent_registry now has ${registry?.length ?? 0} permanent agents:`);
for (const r of registry ?? []) {
  console.log(`  ${r.role.padEnd(10)} ${r.model.padEnd(30)} ${r.id}`);
}

const remaining = await listAllAgents();
console.log(`\nAnthropic side: ${remaining.length} agents live.`);
if (remaining.length !== SPECS.length) {
  console.warn(`WARNING: expected ${SPECS.length}, got ${remaining.length}.`);
}

console.log(`\nbootstrap complete.`);
