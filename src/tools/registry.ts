// Tool registration framework (spec §8).
// Each tool is a pure handler + a JSON schema. `syncToolsToAnthropic` reconciles
// the local registry with the Managed Agents API.

import type { SkillSource, SkillStatus } from "@/types/db";

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

export interface ToolHandlerContext {
  agent_id: string;
  task_id: string | null;
  // Expansion point: inject DB clients, auth tokens, etc. once wired in.
}

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  input_schema: JsonSchemaObject;
  handler: (input: I, ctx: ToolHandlerContext) => Promise<O>;
  // Registry metadata — lets skill_registry stay in sync without a separate manifest.
  source?: SkillSource;
  initial_status?: SkillStatus;
  daily_spend_cap_usd?: number;
}

const TOOLS = new Map<string, ToolDefinition>();

export function defineTool<I, O>(def: ToolDefinition<I, O>): ToolDefinition<I, O> {
  if (TOOLS.has(def.name)) {
    throw new Error(`Tool already registered: ${def.name}`);
  }
  TOOLS.set(def.name, def as ToolDefinition);
  return def;
}

export function listTools(): ToolDefinition[] {
  return Array.from(TOOLS.values());
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.get(name);
}

// Reset helper for tests. Not exported via the package entry point in production code.
export function __resetToolsForTest() {
  TOOLS.clear();
}

// ---------------------------------------------------------------------------
// Managed Agents API sync
// ---------------------------------------------------------------------------
// TODO(phase1): wire this to POST /v1/tools with the beta header once
// ANTHROPIC_API_KEY is set and we know the exact tool-registration endpoint.
// For now this is a no-op stub that logs intent.
// ---------------------------------------------------------------------------

export interface SyncResult {
  synced: string[];
  skipped: string[];
  failures: { name: string; error: string }[];
}

export async function syncToolsToAnthropic(): Promise<SyncResult> {
  const synced: string[] = [];
  const skipped: string[] = [];
  const failures: { name: string; error: string }[] = [];

  for (const tool of listTools()) {
    try {
      // TODO(phase1): replace with real API call:
      //   await fetch(`${API_BASE}/tools`, {
      //     method: "POST",
      //     headers: { ...anthropicHeaders() },
      //     body: JSON.stringify({
      //       name: tool.name,
      //       description: tool.description,
      //       input_schema: tool.input_schema,
      //     }),
      //   });
      // And reconcile into skill_registry via a Supabase upsert.
      skipped.push(tool.name);
    } catch (err) {
      failures.push({
        name: tool.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, skipped, failures };
}
