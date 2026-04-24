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
  dev: 4,
};

export function resolveConcurrencyCap(role: string): number {
  return CAPS[role] ?? 2;
}

// ─── Daily spend cap ────────────────────────────────────────────────────────

export const DAILY_WARN_USD = Number(process.env.DAILY_SPEND_WARN_USD ?? 50);
export const DAILY_HARD_USD = Number(process.env.DAILY_SPEND_HARD_USD ?? 150);

export interface SpendSnapshot {
  total_today_usd: number;
  task_count: number;
  warn: boolean;
  blocked: boolean;
}

/**
 * Sum `cost_usd` across today's completed and in-flight tasks. Tasks that
 * fail before producing any tokens contribute 0, so the cap honestly
 * reflects real burn.
 */
export async function spendToday(): Promise<SpendSnapshot> {
  const since = startOfUtcDay();
  const { data, error } = await supabase()
    .from("tasks")
    .select("cost_usd")
    .gte("created_at", since);
  if (error) throw error;
  const total = (data ?? []).reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
  return {
    total_today_usd: total,
    task_count: data?.length ?? 0,
    warn: total >= DAILY_WARN_USD,
    blocked: total >= DAILY_HARD_USD,
  };
}

function startOfUtcDay(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start.toISOString();
}

export class SpendCapExceeded extends Error {
  constructor(public snapshot: SpendSnapshot) {
    super(`daily spend cap exceeded: $${snapshot.total_today_usd.toFixed(2)} >= $${DAILY_HARD_USD}`);
    this.name = "SpendCapExceeded";
  }
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

/** Insert a `queued` task. Returns the inserted row. Throws SpendCapExceeded
 *  if today's spend is already at or above DAILY_HARD_USD. */
export async function enqueue(args: EnqueueArgs): Promise<Task> {
  const snapshot = await spendToday();
  if (snapshot.blocked) {
    throw new SpendCapExceeded(snapshot);
  }
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
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
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
