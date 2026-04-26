// Direct probe: ask Comms what tools it has. Bypasses the worker queue.
// Usage: node --env-file=.env.local --import tsx scripts/probe-comms-tools.ts

import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadAgentDefinition } from "../src/lib/agents-config";
import { buildSwanToolServer } from "../worker/tools";

async function main() {
  delete process.env.ANTHROPIC_API_KEY;

  const def = await loadAgentDefinition("comms");

  const q = query({
    prompt:
      "List exactly the tool names you have access to in this session. Do NOT call any tool — just enumerate the names you see in your tool list. Reply as a simple bullet list, one tool per line.",
    options: {
      model: def.model,
      systemPrompt: def.prompt,
      settingSources: [],
      mcpServers: { "swan-tools": buildSwanToolServer() },
      allowedTools: [
        "mcp__swan-tools__gmail.list_threads",
        "mcp__swan-tools__gmail.read_thread",
        "mcp__swan-tools__gmail.create_draft",
        "mcp__swan-tools__gmail.send",
        "mcp__swan-tools__calendar.list_events",
        "mcp__swan-tools__calendar.create_event",
        "mcp__swan-tools__slack.send_message",
        "mcp__swan-tools__slack.list_channels",
        "mcp__swan-tools__imessage.send",
        "mcp__swan-tools__dispatch",
        "mcp__swan-tools__vault.read_file",
        "mcp__swan-tools__classify",
        "mcp__swan-tools__hive.query",
      ],
    },
  });

  let text = "";
  for await (const msg of q) {
    if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
      const m = msg as unknown as { model: string; tools?: unknown };
      console.log("=== INIT ===");
      console.log("model:", m.model);
      console.log("tools (init):", JSON.stringify(m.tools ?? "<none>", null, 2));
      console.log("");
    }
    if (msg.type === "assistant") {
      const blocks = (msg as { message?: { content?: { type: string; text?: string }[] } }).message
        ?.content ?? [];
      for (const b of blocks) {
        if (b.type === "text" && b.text) text += b.text;
      }
    }
    if (msg.type === "result") {
      console.log("=== ASSISTANT REPLY ===");
      console.log(text);
      console.log("");
      console.log("usage:", JSON.stringify((msg as { usage?: unknown }).usage));
      break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
