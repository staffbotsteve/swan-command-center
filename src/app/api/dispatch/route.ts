import { NextRequest, NextResponse } from "next/server";
import { enqueue, SpendCapExceeded } from "@/lib/queue";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { pickAgent } from "@/lib/auto-assign";

export const dynamic = "force-dynamic";

/**
 * Dashboard dispatch — enqueue a task and return its id. The local
 * worker (Claude Agent SDK on Steven's Mac) picks it up out-of-band
 * and writes status/output back to the row. The dashboard polls
 * `/api/tasks/[id]` to surface the result.
 *
 * Synchronous Managed-Agents-API execution lived here previously
 * (`runTurn`); that path is gone now that all execution flows through
 * the worker queue.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { agentId: rawAgentId, role: rawRole, task, project, company } = await req.json();
  if (!rawAgentId || !task) {
    return NextResponse.json({ error: "agentId and task required" }, { status: 400 });
  }

  // "auto" → cheap-LLM picks the right role, then we look up the
  // permanent agent for that role from agent_registry.
  let agentId = rawAgentId as string;
  let role = rawRole as string | undefined;
  let autoAssignReason: string | undefined;
  let autoAssignCost: number | undefined;
  if (agentId === "auto") {
    const pick = await pickAgent(task);
    role = pick.role;
    autoAssignReason = pick.reason;
    autoAssignCost = pick.cost_usd_estimate;
    const { data: agent } = await supabase()
      .from("agent_registry")
      .select("id")
      .eq("role", pick.role)
      .eq("status", "permanent")
      .maybeSingle();
    if (!agent) {
      return NextResponse.json(
        { error: `auto-assign picked '${pick.role}' but no permanent agent found for that role` },
        { status: 500 }
      );
    }
    agentId = agent.id;
  }

  let row;
  try {
    row = await enqueue({
      agent_id: agentId,
      channel: "dashboard",
      project,
      company,
      input: { text: task, role, auto_assign_reason: autoAssignReason },
    });
  } catch (e) {
    if (e instanceof SpendCapExceeded) {
      return NextResponse.json(
        {
          error: `daily spend cap: $${e.snapshot.total_today_usd.toFixed(2)} reached`,
          spend_today_usd: e.snapshot.total_today_usd,
        },
        { status: 429 }
      );
    }
    throw e;
  }

  return NextResponse.json({
    task_id: row.id,
    agent_id: agentId,
    role,
    auto_assign: autoAssignReason
      ? { role, reason: autoAssignReason, cost_usd: autoAssignCost }
      : undefined,
  });
}
