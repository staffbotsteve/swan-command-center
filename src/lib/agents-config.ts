import fs from "node:fs/promises";
import path from "node:path";

/**
 * Minimal shape of an SDK agent definition (matches
 * `@anthropic-ai/claude-agent-sdk`'s `Options.agents` value type).
 */
export interface AgentDefinition {
  description: string;
  prompt: string;
  model?: string;
  tools?: string[];
}

/**
 * Roster and model assignments. Mirrors spec §4 / scripts/bootstrap-agents.mjs
 * SPECS. Models reflect the cost tier-down from 2026-04-24.
 */
export const ROLE_SPECS: Record<string, { displayName: string; model: string; file: string; description: string }> = {
  main: {
    displayName: "Main",
    model: "claude-haiku-4-5-20251001",
    file: "main.md",
    description: "Triage / default fallback. Reads ambiguous messages and delegates.",
  },
  research: {
    displayName: "Research",
    model: "claude-sonnet-4-6",
    file: "research.md",
    description: "Deep analysis across all 8 LLCs. Uses NotebookLM, YouTube, vault.",
  },
  comms: {
    displayName: "Comms",
    model: "claude-sonnet-4-6",
    file: "comms.md",
    description: "Email / calendar / VIP screening. Gmail + Calendar tools.",
  },
  content: {
    displayName: "Content",
    model: "claude-haiku-4-5-20251001",
    file: "content.md",
    description: "Scripts, posts, thumbnails. Haiku tier; escalate to Sonnet explicitly.",
  },
  ops: {
    displayName: "Ops",
    model: "claude-sonnet-4-6",
    file: "ops.md",
    description: "Finances / vendors / daily rollup across LLCs.",
  },
  legal: {
    displayName: "Legal",
    model: "claude-opus-4-7",
    file: "legal.md",
    description: "Entity-aware compliance and contract review. Opus tier.",
  },
  dev: {
    displayName: "Dev",
    model: "claude-sonnet-4-6",
    file: "dev.md",
    description: "Async engineering: PR review, deploy triage, specs. Sonnet tier.",
  },
};

const AGENT_DIR = path.join(process.cwd(), "src", "agents");

export async function loadAgentDefinition(role: string): Promise<AgentDefinition> {
  const spec = ROLE_SPECS[role];
  if (!spec) throw new Error(`unknown role: ${role}`);
  const prompt = await fs.readFile(path.join(AGENT_DIR, spec.file), "utf-8");
  return {
    description: spec.description,
    prompt,
    model: spec.model,
  };
}

/** Load all roles at once. Useful when spinning up a worker. */
export async function loadAllAgentDefinitions(): Promise<Record<string, AgentDefinition>> {
  const out: Record<string, AgentDefinition> = {};
  for (const role of Object.keys(ROLE_SPECS)) {
    out[role] = await loadAgentDefinition(role);
  }
  return out;
}
