import { route } from "@/routing";
import type { IncomingMessage, RoutingDecision } from "@/routing";
import { supabase } from "@/lib/supabase";
import { enqueue } from "@/lib/queue";
import type { AgentRegistryEntry } from "@/types/db";

export interface IngestResult {
  decision: RoutingDecision;
  agent: AgentRegistryEntry;
  task_id: string;
}

async function resolveAgentByRole(role: string): Promise<AgentRegistryEntry> {
  const { data, error } = await supabase()
    .from("agent_registry")
    .select("*")
    .eq("role", role)
    .eq("status", "permanent")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`no permanent agent for role '${role}'`);
  return data as AgentRegistryEntry;
}

async function loadChannelHints(): Promise<Record<string, string>> {
  const { data } = await supabase().from("channel_routing").select("external_id, agent_role");
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    out[row.external_id] = row.agent_role;
  }
  return out;
}

/**
 * Accept an inbound message from any channel: route it, resolve the agent,
 * enqueue a task row, and return IDs for the caller to drive the agent run.
 */
export async function ingest(msg: IncomingMessage): Promise<IngestResult> {
  const channelHints = await loadChannelHints();
  const decision = route(msg, { channelHints });
  const agent = await resolveAgentByRole(decision.agent);
  const task = await enqueue({
    agent_id: agent.id,
    channel: msg.channel,
    source_id: msg.external_id,
    input: { text: msg.text, sender: msg.sender, rule: decision.rule, confidence: decision.confidence },
  });
  return { decision, agent, task_id: task.id };
}
