// Probe whether the Claude Agent SDK can run against the local Max-tier
// Claude Code subscription with NO ANTHROPIC_API_KEY in the environment.
// If it succeeds, Option C is viable — zero per-token cost.
//
// Usage: node scripts/sdk-probe.mjs

import { query } from "@anthropic-ai/claude-agent-sdk";

const hadKey = !!process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
console.log(`ANTHROPIC_API_KEY present before probe: ${hadKey}; unset for this test`);

const start = Date.now();
const q = query({
  prompt: "reply with exactly the single word OK and nothing else",
  options: {
    model: "claude-haiku-4-5-20251001",
    settingSources: [],
    allowedTools: [],
    systemPrompt: "You answer with exactly one word.",
  },
});

let finalText = "";
let resultMsg = null;
for await (const msg of q) {
  if (msg.type === "assistant") {
    const blocks = msg.message?.content ?? [];
    for (const b of blocks) {
      if (b.type === "text") finalText += b.text;
    }
  } else if (msg.type === "result") {
    resultMsg = msg;
    break;
  } else if (msg.type === "system" && msg.subtype === "init") {
    console.log(`init: model=${msg.model} session=${msg.session_id}`);
  }
}

const elapsed = Math.round(Date.now() - start);
console.log(`\nreply: "${finalText.trim()}"`);
console.log(`elapsed: ${elapsed}ms`);
if (resultMsg) {
  console.log(`result subtype:    ${resultMsg.subtype}`);
  console.log(`usage input_tokens: ${resultMsg.usage?.input_tokens ?? "-"}`);
  console.log(`usage output_tokens: ${resultMsg.usage?.output_tokens ?? "-"}`);
  console.log(`cache_read_input_tokens: ${resultMsg.usage?.cache_read_input_tokens ?? "-"}`);
  console.log(`total_cost_usd:    ${resultMsg.total_cost_usd ?? "-"}`);
  console.log(`num_turns:         ${resultMsg.num_turns ?? "-"}`);
}
