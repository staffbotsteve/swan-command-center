// Live smoke test for the Gmail / Calendar / Drive tools.
// Usage: node --env-file=.env.local --import tsx scripts/smoke-google.ts

import { listThreads } from "../src/tools/gmail";
import { listEvents } from "../src/tools/calendar";
import { listFiles } from "../src/tools/drive";

async function main() {
  console.log("--- gmail.list_threads INBOX ---");
  const gm = (await listThreads.handler(
    { max_results: 3, label_ids: ["INBOX"] },
    { agent_id: "smoke", task_id: null }
  )) as { threads?: { id: string; snippet?: string }[]; resultSizeEstimate?: number };
  console.log("threads:", gm.threads?.length ?? 0, "/ resultSizeEstimate:", gm.resultSizeEstimate);

  console.log("\n--- calendar.list_events (next 7 days) ---");
  const cal = (await listEvents.handler(
    {
      time_min: new Date().toISOString(),
      time_max: new Date(Date.now() + 7 * 86400_000).toISOString(),
      max_results: 5,
    },
    { agent_id: "smoke", task_id: null }
  )) as { items?: { summary: string; start: { dateTime?: string; date?: string } }[] };
  console.log("events:", cal.items?.length ?? 0);
  for (const e of (cal.items ?? []).slice(0, 3)) {
    console.log("  -", e.summary, "@", e.start?.dateTime ?? e.start?.date);
  }

  console.log("\n--- drive.list_files (5 most recent) ---");
  const dr = (await listFiles.handler(
    { page_size: 5 },
    { agent_id: "smoke", task_id: null }
  )) as { files?: { name: string; mimeType?: string }[] };
  console.log("files:", dr.files?.length ?? 0);
  for (const f of (dr.files ?? []).slice(0, 5)) {
    console.log("  -", f.name, `[${f.mimeType?.split(".").pop()}]`);
  }
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});
