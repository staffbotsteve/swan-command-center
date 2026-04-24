import { defineTool } from "./registry";
import { supabase } from "@/lib/supabase";
import type { HiveQueryInput, HiveQueryOutput } from "@/types/tools";
import type { Task } from "@/types/db";

export default defineTool<HiveQueryInput, HiveQueryOutput>({
  name: "hive.query",
  description:
    "Query the hive-mind task ledger. Every agent's completed work is cross-readable. Supports filters by agent, company, project, status, and time.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      agent_id: { type: "string" },
      company: { type: "string" },
      project: { type: "string" },
      status: {
        type: "string",
        enum: ["queued", "in_flight", "awaiting_user", "done", "failed", "archived"],
      },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      since: { type: "string", description: "ISO-8601 timestamp; tasks created after this." },
    },
    additionalProperties: false,
  },
  async handler(input) {
    let q = supabase()
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 50);
    if (input.agent_id) q = q.eq("agent_id", input.agent_id);
    if (input.company) q = q.eq("company", input.company);
    if (input.project) q = q.eq("project", input.project);
    if (input.status) q = q.eq("status", input.status);
    if (input.since) q = q.gte("created_at", input.since);
    const { data, error } = await q;
    if (error) throw new Error(`hive.query: ${error.message}`);
    return { tasks: (data ?? []) as Task[] };
  },
});
