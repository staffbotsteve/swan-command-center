/**
 * Swan Command Center worker.
 *
 * A long-lived Node process that drains the Supabase task queue and runs
 * Claude Agent SDK turns against Steven's Claude Code subscription.
 * Portable by design — the same binary runs in scenario A (laptop),
 * B (laptop + tiny VPS), or C (dedicated Mac). Nothing in this file is
 * host-specific.
 *
 * Environment it expects (all required, no defaults):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CMD_CENTER_BASE_URL         — e.g. https://swan-command-center.vercel.app
 *   WORKER_SECRET               — shared bearer for /api/tools/[name]
 *
 * Optional:
 *   WORKER_POLL_INTERVAL_MS     — default 1000
 *   WORKER_MAX_CONCURRENCY      — default 3
 *   WORKER_ENABLED_ROLES        — comma-separated allow-list; default all 7
 *
 * Start with:  npm run worker
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { loadAllAgentDefinitions, ROLE_SPECS, type AgentDefinition } from "../src/lib/agents-config";
import { sendTelegram } from "../src/lib/channels/telegram-send";
import type { Task } from "../src/types/db";
import { buildSwanToolServer, SWAN_TOOL_NAMES } from "./tools";

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
// CMD_CENTER_BASE_URL + WORKER_SECRET reserved for future HTTP tool fallback
// (currently tools run in-process via MCP — no Vercel hop needed).
const POLL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1000);
const MAX_CONC = Number(process.env.WORKER_MAX_CONCURRENCY ?? 3);
const ENABLED_ROLES = (process.env.WORKER_ENABLED_ROLES ?? Object.keys(ROLE_SPECS).join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set in environment`);
  return v;
}

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

let shuttingDown = false;
let inFlight = 0;
let agentDefs: Record<string, AgentDefinition>;

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[worker] shutdown requested, draining ${inFlight} in-flight...`);
}

async function claim(): Promise<Task | null> {
  // Atomically claim the oldest queued row whose agent role is in our allow-list.
  const { data, error } = await sb.rpc("claim_queued_task", {
    role_allow_list: ENABLED_ROLES,
  });
  if (error) {
    // Fall back to a non-atomic claim while the RPC isn't deployed yet.
    if ((error.code ?? "") === "PGRST202" || error.message?.includes("does not exist")) {
      return claimNonAtomic();
    }
    throw error;
  }
  return (data?.[0] as Task | undefined) ?? null;
}

async function claimNonAtomic(): Promise<Task | null> {
  const roleAgents = await resolveAgentIdsByRole();
  if (roleAgents.length === 0) return null;
  const { data, error } = await sb
    .from("tasks")
    .select("*")
    .eq("status", "queued")
    .in("agent_id", roleAgents)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = data?.[0] as Task | undefined;
  if (!row) return null;
  const { error: upd } = await sb
    .from("tasks")
    .update({ status: "in_flight", started_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "queued"); // conditional to avoid double-claim
  if (upd) return null;
  return row;
}

async function resolveAgentIdsByRole(): Promise<string[]> {
  const { data } = await sb
    .from("agent_registry")
    .select("id")
    .in("role", ENABLED_ROLES)
    .eq("status", "permanent");
  return (data ?? []).map((r) => r.id);
}

async function roleForAgent(agentId: string): Promise<string | null> {
  const { data } = await sb
    .from("agent_registry")
    .select("role")
    .eq("id", agentId)
    .maybeSingle();
  return data?.role ?? null;
}

async function runTurnForTask(task: Task): Promise<{ text: string; error?: string; tokens_in: number; tokens_out: number }> {
  const role = (await roleForAgent(task.agent_id)) ?? "main";
  const def = agentDefs[role];
  if (!def) throw new Error(`no agent def for role ${role}`);
  const input = (task.input as { text?: string } | null) ?? {};
  const prompt = input.text ?? "";
  if (!prompt) return { text: "", error: "empty prompt", tokens_in: 0, tokens_out: 0 };

  let text = "";
  let tokens_in = 0;
  let tokens_out = 0;

  // Subagents Main can delegate to via the SDK's built-in Agent tool.
  // Other roles run without subagents for now — they can spawn ephemeral
  // helpers in a later phase. Main has the entire roster as candidates.
  const subagents =
    role === "main"
      ? {
          research: { description: agentDefs.research.description, prompt: agentDefs.research.prompt, model: agentDefs.research.model },
          comms:    { description: agentDefs.comms.description,    prompt: agentDefs.comms.prompt,    model: agentDefs.comms.model },
          content:  { description: agentDefs.content.description,  prompt: agentDefs.content.prompt,  model: agentDefs.content.model },
          ops:      { description: agentDefs.ops.description,      prompt: agentDefs.ops.prompt,      model: agentDefs.ops.model },
          legal:    { description: agentDefs.legal.description,    prompt: agentDefs.legal.prompt,    model: agentDefs.legal.model },
          dev:      { description: agentDefs.dev.description,      prompt: agentDefs.dev.prompt,      model: agentDefs.dev.model },
        }
      : undefined;

  const q = sdkQuery({
    prompt,
    options: {
      model: def.model,
      systemPrompt: def.prompt,
      settingSources: [],
      mcpServers: { "swan-tools": buildSwanToolServer() },
      allowedTools: SWAN_TOOL_NAMES,
      ...(subagents ? { agents: subagents } : {}),
    },
  });

  for await (const msg of q) {
    if (msg.type === "assistant") {
      for (const block of msg.message?.content ?? []) {
        if (block.type === "text") text += block.text;
      }
    } else if (msg.type === "result") {
      tokens_in = msg.usage?.input_tokens ?? 0;
      tokens_out = msg.usage?.output_tokens ?? 0;
      break;
    }
  }
  return { text, tokens_in, tokens_out };
}

async function respondOverChannel(task: Task, text: string): Promise<void> {
  const channel = task.channel;
  const sourceId = task.source_id;
  if (!sourceId) return; // dashboard tasks get their reply via polling /api/hive
  try {
    if (channel === "telegram") {
      await sendTelegram(sourceId, text || "(empty response)");
    }
    // Slack/email dispatch land in Phase 2 of the original plan.
  } catch (e) {
    console.error(`[worker] dispatch to ${channel} failed:`, e);
  }
}

async function processOne(task: Task): Promise<void> {
  inFlight++;
  try {
    console.log(`[worker] claimed task=${task.id.slice(0, 8)} agent=${task.agent_id.slice(0, 16)}`);
    const turn = await runTurnForTask(task);
    if (turn.error) {
      await sb
        .from("tasks")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          tokens_in: turn.tokens_in,
          tokens_out: turn.tokens_out,
          output: { error: turn.error },
        })
        .eq("id", task.id);
      await respondOverChannel(task, `⚠️ ${turn.error}`);
      return;
    }
    await sb
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        tokens_in: turn.tokens_in,
        tokens_out: turn.tokens_out,
        cost_usd: 0, // CC subscription — no per-token charge
        output: { text: turn.text, runtime: "sdk" },
      })
      .eq("id", task.id);
    await respondOverChannel(task, turn.text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[worker] task ${task.id} failed:`, msg);
    await sb
      .from("tasks")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        output: { error: msg },
      })
      .eq("id", task.id);
  } finally {
    inFlight--;
  }
}

async function main() {
  // Force Claude Code subscription auth by removing any API key that
  // leaked in from the environment. The SDK reads ~/.claude/ OAuth
  // tokens when ANTHROPIC_API_KEY is absent, which is what we want —
  // zero per-token billing against Steven's Max subscription.
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`[worker] unsetting ANTHROPIC_API_KEY to force CC-subscription auth`);
    delete process.env.ANTHROPIC_API_KEY;
  }
  console.log(`[worker] starting. roles=[${ENABLED_ROLES.join(",")}] max_conc=${MAX_CONC}`);
  agentDefs = await loadAllAgentDefinitions();
  console.log(`[worker] loaded ${Object.keys(agentDefs).length} agent defs`);

  while (!shuttingDown) {
    if (inFlight >= MAX_CONC) {
      await sleep(POLL_MS);
      continue;
    }
    const task = await claim().catch((e) => {
      console.error(`[worker] claim error:`, e);
      return null;
    });
    if (!task) {
      await sleep(POLL_MS);
      continue;
    }
    // fire-and-forget; bounded by MAX_CONC via inFlight check
    void processOne(task);
  }

  while (inFlight > 0) await sleep(200);
  console.log(`[worker] shutdown complete`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(`[worker] fatal:`, e);
  process.exit(1);
});
