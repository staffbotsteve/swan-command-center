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

interface ChannelRoutingRow {
  channel: string;
  external_id: string;
  agent_role: string;
  company: string | null;
  project: string | null;
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

/**
 * Load all routing rows for a given channel into a map keyed by external_id.
 * Channel-scoped query keeps Slack channel ids from colliding with
 * Telegram chat ids on the off chance they share a value.
 */
async function loadChannelRoutingMap(
  channel: string
): Promise<Map<string, ChannelRoutingRow>> {
  const { data } = await supabase()
    .from("channel_routing")
    .select("channel, external_id, agent_role, company, project")
    .eq("channel", channel);
  const map = new Map<string, ChannelRoutingRow>();
  for (const row of (data ?? []) as ChannelRoutingRow[]) {
    map.set(row.external_id, row);
  }
  return map;
}

/**
 * Accept an inbound message from any channel: route it, resolve the agent,
 * enqueue a task row, and return IDs for the caller to drive the agent run.
 *
 * Per-channel routing precedence:
 * 1. If there's a matching channel_routing row, its agent_role wins
 *    over Main-fallback delegation, and any company/project tags
 *    auto-attach to the task. (Skips a Main hop when we already know
 *    the right specialist.)
 * 2. Explicit @-mentions / slash commands in the message text still
 *    take precedence over the channel mapping (handled inside route()).
 */
export async function ingest(msg: IncomingMessage): Promise<IngestResult> {
  const routingMap = await loadChannelRoutingMap(msg.channel);

  // Pass simplified hints to the rules-first router (it just wants
  // external_id -> role for its channel_hint rule).
  const channelHints: Record<string, string> = {};
  for (const [extId, row] of routingMap) channelHints[extId] = row.agent_role;

  const decision = route(msg, { channelHints });
  const agent = await resolveAgentByRole(decision.agent);

  // Pull company/project from the matched routing row if any.
  const matchedRow = routingMap.get(msg.external_id);

  const task = await enqueue({
    agent_id: agent.id,
    channel: msg.channel,
    source_id: msg.external_id,
    company: matchedRow?.company ?? null,
    project: matchedRow?.project ?? null,
    input: {
      text: msg.text,
      sender: msg.sender,
      rule: decision.rule,
      confidence: decision.confidence,
    },
  });
  return { decision, agent, task_id: task.id };
}
