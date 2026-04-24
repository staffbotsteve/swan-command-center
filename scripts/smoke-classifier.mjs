// Live smoke test of the Gemini Flash classifier.
// Usage: node --env-file=.env.local scripts/smoke-classifier.mjs

import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = `You classify short conversation fragments into exactly one memory kind.
Respond with STRICT JSON matching:
{"kind":"fact|preference|context|pinned|noise","importance":0..1,"tags":[],"company":"","project":""}
Output strict JSON only.`;

const samples = [
  "I hate exclamation marks in my LinkedIn posts.",
  "I'll be in San Francisco next week.",
  "Providence Fire & Rescue has 23 volunteer firefighters as of April 2026.",
  "Always remember that my mailing list for E2S hospitality is hosp-ca-list@e2s.com.",
  "ok",
];

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

for (const text of samples) {
  const resp = await model.generateContent([PROMPT, `text: ${text}`].join("\n\n"));
  const raw = resp.response.text().trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(`  raw: ${raw}`);
    continue;
  }
  console.log(`${text}`);
  console.log(`  -> kind=${parsed.kind} importance=${parsed.importance} tags=${JSON.stringify(parsed.tags)}`);
}
