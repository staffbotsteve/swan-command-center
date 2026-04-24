// Tool input/output shapes for the hosted tool fabric (spec §8).
// Every tool route under src/app/api/tools/** should import these.

// ─── NotebookLM ──────────────────────────────────────────────────────────────

export interface NotebookSummary {
  id: string;
  title: string;
  source_count: number;
  updated_at: string;
}

export interface NotebookSource {
  id: string;
  kind: "url" | "pdf" | "text" | "youtube" | "drive";
  title?: string;
  url?: string;
  added_at: string;
}

export interface NbListNotebooksOutput {
  notebooks: NotebookSummary[];
}

export interface NbCreateNotebookInput {
  title: string;
}
export interface NbCreateNotebookOutput {
  notebook_id: string;
}

export interface NbAddSourceInput {
  notebook_id: string;
  url: string;
}
export interface NbAddSourceOutput {
  source_id: string;
}

export interface NbQueryInput {
  notebook_id: string;
  question: string;
}
export interface NbQueryOutput {
  answer: string;
  citations: { source_id: string; snippet: string }[];
}

export interface NbGenerateReportInput {
  notebook_id: string;
  style?: "briefing" | "deep_dive" | "slide_deck" | "infographic";
}
export interface NbGenerateReportOutput {
  url?: string;           // shareable link if NotebookLM exposes one
  markdown?: string;      // inline content if pulled back
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

export interface YoutubeSearchInput {
  query: string;
  max_results?: number;
}

export interface YoutubeVideoResult {
  video_id: string;
  title: string;
  channel: string;
  url: string;
  duration_seconds?: number;
  transcript?: string;
}

export interface YoutubeSearchOutput {
  results: YoutubeVideoResult[];
}

// ─── Vault ───────────────────────────────────────────────────────────────────

export interface VaultReadFileInput {
  path: string;
}
export interface VaultReadFileOutput {
  path: string;
  content: string;
  sha: string;
}

export interface VaultListDirInput {
  path: string;
}
export interface VaultListDirOutput {
  entries: { name: string; path: string; type: "file" | "dir" }[];
}

export interface VaultWriteFileInput {
  path: string;
  content: string;
  commit_message?: string;
}
export interface VaultWriteFileOutput {
  path: string;
  sha: string;
}

// ─── Web search ──────────────────────────────────────────────────────────────

export interface WebSearchInput {
  query: string;
  max_results?: number;
}
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}
export interface WebSearchOutput {
  results: WebSearchResult[];
}

// ─── Dispatch (outbound messaging) ───────────────────────────────────────────

export interface DispatchInput {
  channel: "telegram" | "slack" | "email";
  recipient: string;               // chat id / user id / email address
  text: string;
  attachments?: { kind: "image" | "file"; url: string; name?: string }[];
  thread_id?: string;              // for email / slack
}
export interface DispatchOutput {
  delivered: boolean;
  external_message_id?: string;
}

// ─── Hive query ──────────────────────────────────────────────────────────────

export interface HiveQueryInput {
  agent_id?: string;
  company?: string;
  project?: string;
  status?: import("./db").TaskStatus;
  limit?: number;
  since?: string; // ISO timestamp
}
export interface HiveQueryOutput {
  tasks: import("./db").Task[];
}

// ─── Classify ────────────────────────────────────────────────────────────────

export interface ClassifyInput {
  text: string;
  context?: string;
}
export interface ClassifyOutput {
  kind: import("./db").MemoryKind | "noise";
  importance: number;       // 0..1
  tags: string[];
  company?: string;
  project?: string;
}

// ─── Image generation ────────────────────────────────────────────────────────

export interface ImageGenerateInput {
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "3:4" | "4:3";
  style?: string;
}
export interface ImageGenerateOutput {
  url: string;
}

// ─── spawn_subagent ──────────────────────────────────────────────────────────

export interface SpawnSubagentInput {
  role: string;                    // descriptive, e.g. "tax-researcher"
  instructions: string;            // system prompt for the sub-agent
  ttl_seconds?: number;            // default 1800, max 7200
  reason: string;                  // audit-log breadcrumb
}
export interface SpawnSubagentOutput {
  child_agent_id: string;
  ttl_seconds: number;
}

// ─── Skill manager ───────────────────────────────────────────────────────────

export interface SkillActivateInput {
  name: string;
  agent_id: string;
}
export interface SkillActivateOutput {
  activated: boolean;
}

export interface SkillProposeInput {
  name: string;
  description: string;
  rationale: string;
  desired_inputs?: Record<string, string>;
  desired_outputs?: Record<string, string>;
}
export interface SkillProposeOutput {
  proposal_id: string;
  status: "pr_pending";
}

export interface SkillListInput {
  status?: import("./db").SkillStatus;
}
export interface SkillListOutput {
  skills: import("./db").SkillRegistryEntry[];
}
