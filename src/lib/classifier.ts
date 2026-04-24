import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClassifyInput, ClassifyOutput } from "@/types/tools";

const PROMPT = `You classify short conversation fragments into exactly one memory kind.
Respond with STRICT JSON matching:
{"kind":"fact|preference|context|pinned|noise","importance":0..1,"tags":[],"company":"","project":""}

Rules:
- "fact": objective true statement about the user's world (addresses, IDs, entity facts).
- "preference": how the user wants things done (tone, cadence, do/don't).
- "context": transient but useful (travel, current project focus, this-week state).
- "pinned": user explicitly asked to remember across all agents (pin, always, every time).
- "noise": worth discarding.

Importance: 0..1 where 1 = critical-to-remember-forever, 0.5 = medium-term, 0.2 = probably-noise.
Tags: 1-4 short lowercase words. Company and project optional; leave empty string if not inferrable.
Output strict JSON only. No code fences, no prose.`;

let _client: GoogleGenerativeAI | null = null;

function client(): GoogleGenerativeAI {
  if (_client) return _client;
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
  _client = new GoogleGenerativeAI(key);
  return _client;
}

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  const model = client().getGenerativeModel({ model: "gemini-2.5-flash" });
  const parts = [PROMPT, `text: ${input.text}`];
  if (input.context) parts.push(`context: ${input.context}`);

  const resp = await model.generateContent(parts.join("\n\n"));
  const raw = resp.response.text().trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(raw);

  return {
    kind: parsed.kind === "noise" ? "noise" : (parsed.kind ?? "noise"),
    importance: Math.max(0, Math.min(1, Number(parsed.importance ?? 0.5))),
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : [],
    company: parsed.company || undefined,
    project: parsed.project || undefined,
  };
}
