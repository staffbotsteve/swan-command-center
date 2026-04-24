// Type mirrors for the Supabase schema at supabase/migrations/0001_v2_schema.sql.
// Keep in sync with the SQL when adding columns.

export type Channel = "dashboard" | "telegram" | "slack" | "email" | "voice" | "internal";

export type TaskStatus =
  | "queued"
  | "in_flight"
  | "awaiting_user"
  | "done"
  | "failed"
  | "archived";

export interface Task {
  id: string;
  agent_id: string;
  parent_task_id: string | null;
  channel: Channel | null;
  source_id: string | null;
  project: string | null;
  company: string | null;
  priority: number;
  status: TaskStatus;
  system_prompt_hash: string | null;
  session_id: string | null;
  input: unknown;
  output: unknown;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export type MemoryKind = "fact" | "preference" | "context" | "pinned";

export interface Memory {
  id: string;
  kind: MemoryKind;
  body: string;
  tags: string[];
  company: string | null;
  project: string | null;
  importance: number;
  ttl_days: number | null;
  source_task_id: string | null;
  promoted_to_vault_at: string | null;
  vault_path: string | null;
  created_at: string;
  last_used_at: string | null;
}

export type AgentRole =
  | "main"
  | "research"
  | "comms"
  | "content"
  | "ops"
  | "legal"
  | string; // open for promoted/custom roles

export type AgentStatus = "permanent" | "ephemeral" | "awaiting_promotion" | "archived";

export interface AgentRegistryEntry {
  id: string;
  role: AgentRole;
  display_name: string;
  model: string;
  system_prompt_template: string | null;
  status: AgentStatus;
  parent_agent_id: string | null;
  creator_task_id: string | null;
  created_at: string;
  promoted_at: string | null;
  archived_at: string | null;
}

export type SkillSource = "builtin" | "curated" | "agent_authored";
export type SkillStatus = "experimental" | "standard" | "pr_pending" | "archived";

export interface SkillRegistryEntry {
  name: string;
  description: string | null;
  source: SkillSource;
  status: SkillStatus;
  tool_definition: unknown;
  code_ref: string | null;
  pr_url: string | null;
  author_agent_id: string | null;
  install_count: number;
  success_count: number;
  failure_count: number;
  daily_spend_cap_usd: number | null;
  created_at: string;
  promoted_at: string | null;
}

export type SpawnOutcome = "success" | "timeout" | "error" | "promoted" | "pending";

export interface SpawnLogEntry {
  id: string;
  parent_agent_id: string;
  child_agent_id: string | null;
  reason: string | null;
  task_id: string | null;
  ttl_seconds: number | null;
  created_at: string;
  terminated_at: string | null;
  outcome: SpawnOutcome | null;
}

export type InstallAction =
  | "activate"
  | "deactivate"
  | "propose"
  | "pr_opened"
  | "pr_approved"
  | "pr_merged"
  | "archive";

export interface InstallLogEntry {
  id: string;
  skill_name: string;
  agent_id: string | null;
  triggered_by_task_id: string | null;
  action: InstallAction;
  notes: string | null;
  created_at: string;
}

export interface ChannelRouting {
  channel: Channel;
  external_id: string;
  agent_role: AgentRole;
  created_at: string;
}
