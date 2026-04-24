// Non-destructive preview of the agent bootstrap.
// Shows exactly what would be archived and created without touching anything.
//
// Usage: node --env-file=.env.local scripts/bootstrap-preview.mjs

import fs from "node:fs/promises";
import path from "node:path";

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
  { role: "dev",      display: "Dev",      model: "claude-opus-4-7",           file: "dev.md" },
];

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

const existing = await listAllAgents();

console.log(`\n=== CURRENT STATE ===`);
console.log(`Total existing Managed Agents: ${existing.length}\n`);

console.log(`First 10:`);
for (const a of existing.slice(0, 10)) {
  console.log(`  ${a.id}  ${a.model.padEnd(28)} ${a.name}`);
}
if (existing.length > 10) console.log(`  ... (${existing.length - 10} more)`);

console.log(`\n=== WOULD ARCHIVE ===`);
console.log(`${existing.length} agents (ALL of them — including current dashboard roster)`);

console.log(`\n=== WOULD CREATE ===`);
const agentDir = path.join(process.cwd(), "src", "agents");
for (const spec of SPECS) {
  const promptPath = path.join(agentDir, spec.file);
  try {
    const body = await fs.readFile(promptPath, "utf-8");
    const firstLine = body.split("\n").slice(0, 1).join("").replace(/^#\s*/, "");
    console.log(`  ${spec.role.padEnd(10)} ${spec.model.padEnd(30)} "${firstLine}" (${body.length} chars)`);
  } catch (e) {
    console.log(`  ${spec.role.padEnd(10)} MISSING PROMPT FILE at ${promptPath}`);
  }
}

console.log(`\n=== NEXT ACTIONS ===`);
console.log(`If this looks right, run the actual bootstrap:`);
console.log(`  node --env-file=.env.local scripts/bootstrap-agents.mjs --yes`);
console.log(`\nWithout --yes it refuses to touch anything.\n`);
