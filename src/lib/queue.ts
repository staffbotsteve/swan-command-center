import { supabase } from "@/lib/supabase";
import type { Channel, Task, TaskStatus } from "@/types/db";

/**
 * Per-role concurrency caps. Unknown/ephemeral roles default to 2.
 * Values come from spec §4.
 */
const CAPS: Record<string, number> = {
  main: 10,
  research: 8,
  comms: 6,
  content: 4,
  ops: 6,
  legal: 3,
};

export function resolveConcurrencyCap(role: string): number {
  return CAPS[role] ?? 2;
}

export interface EnqueueArgs {
  agent_id: string;
  channel: Channel;
  source_id?: string | null;
  project?: string | null;
  company?: string | null;
  priority?: number;
  input: unknown;
  parent_task_id?: string | null;
}

/** Insert a `queued` task. Returns the inserted row. */
export async function enqueue(args: EnqueueArgs): Promise<Task> {
  const { data, error } = await supabase()
    .from("tasks")
    .insert({
      agent_id: args.agent_id,
      channel: args.channel,
      source_id: args.source_id ?? null,
      project: args.project ?? null,
      company: args.company ?? null,
      priority: args.priority ?? 50,
      status: "queued",
      input: args.input,
      parent_task_id: args.parent_task_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Task;
}

/** Count how many tasks are currently non-terminal for an agent. */
export async function countInFlight(agent_id: string): Promise<number> {
  const { count, error } = await supabase()
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agent_id)
    .in("status", ["in_flight", "awaiting_user"]);
  if (error) throw error;
  return count ?? 0;
}

export interface MarkStatusPatch {
  status: TaskStatus;
  session_id?: string;
  started_at?: string;
  completed_at?: string;
  output?: unknown;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
}

export async function markStatus(task_id: string, patch: MarkStatusPatch): Promise<void> {
  const { error } = await supabase()
    .from("tasks")
    .update(patch)
    .eq("id", task_id);
  if (error) throw error;
}

/**
 * Pull the next queued task for an agent if capacity allows.
 * Returns null if the agent is at its cap or no queued tasks exist.
 */
export async function nextQueuedForAgent(
  agent_id: string,
  role: string
): Promise<Task | null> {
  const cap = resolveConcurrencyCap(role);
  const inflight = await countInFlight(agent_id);
  if (inflight >= cap) return null;
  const { data, error } = await supabase()
    .from("tasks")
    .select("*")
    .eq("agent_id", agent_id)
    .eq("status", "queued")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Task | undefined) ?? null;
}
