import { GoogleGenerativeAI } from "@google/generative-ai";
import { ROLE_SPECS } from "@/lib/agents-config";

/**
 * Cheap-LLM task router. Given a free-text task, picks one of the
 * permanent department roles. Used by /api/dispatch when agentId="auto"
 * — the dashboard's "Auto Assign" UX from the original video.
 *
 * Cost (per memory rule): Gemini 2.5 Flash, ~$0.075/M input tokens.
 * A typical pickAgent call is ~600 in / 50 out = ~$0.0001 per task.
 * Basically free.
 */

const PROMPT_HEADER = `You are a task router. Given a user request, pick exactly ONE agent role to handle it.

Roles available:
- main: triage / fallback when nothing else fits, or when delegation itself is the right answer
- research: deep analysis, web search, YouTube transcripts, Drive content, knowledge synthesis, competitive teardowns
- comms: email triage and drafting (Gmail), calendar coordination (Google Calendar), VIP screening
- content: writing (LinkedIn / X / newsletter / YouTube scripts), thumbnails, image generation
- ops: financial reads (Stripe), vendor records, reconciliation, daily rollups across companies
- legal: contracts, compliance, entity-specific filings, regulatory reads
- dev: code review (GitHub PRs), deploy/CI triage, shell commands, writing engineering specs

Respond with STRICT JSON ONLY (no code fence, no prose):
{"role":"<one_of_the_role_keys>","reason":"<one sentence>"}`;

export interface PickAgentResult {
  role: string;
  reason: string;
  cost_usd_estimate: number;
}

export async function pickAgent(task: string): Promise<PickAgentResult> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
  const genai = new GoogleGenerativeAI(key);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const resp = await model.generateContent(
    [PROMPT_HEADER, `Task: ${task}`].join("\n\n")
  );
  const raw = resp.response
    .text()
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");

  let parsed: { role?: string; reason?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fall back to main if Gemini hands back something unparseable.
    return { role: "main", reason: "router output unparseable; defaulting to main", cost_usd_estimate: 0 };
  }

  const role = parsed.role && ROLE_SPECS[parsed.role] ? parsed.role : "main";
  const reason = parsed.reason ?? "no reason given";

  // Approximate cost: ~600 input tokens for the prompt + task, ~50 output tokens.
  // Gemini 2.5 Flash: $0.075/M in, $0.30/M out.
  const cost_usd_estimate = (600 * 0.075 + 50 * 0.3) / 1_000_000;

  return { role, reason, cost_usd_estimate };
}
