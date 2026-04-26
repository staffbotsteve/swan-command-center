import { NextRequest, NextResponse } from "next/server";
import { runTurn } from "@/lib/anthropic";
import { enqueue, markStatus, SpendCapExceeded } from "@/lib/queue";
import { auth } from "@/lib/auth";
import { costUsd } from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import { pickAgent } from "@/lib/auto-assign";

export const dynamic = "force-dynamic";
const ENV_ID = process.env.SWAN_ENV_ID ?? "env_01L4sqBNP3fo5hPLPSTtq7P1";

/**
 * Dashboard dispatch — POST a task, the route waits for the agent to finish
 * and returns `{ text, error, session_id, task_id }`. The older SSE approach
 * was aligned with an earlier shape of the Managed Agents beta; this version
 * uses the current `runTurn` helper.
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

  // Look up model for cost calc
  const { data: regRow } = await supabase()
    .from("agent_registry")
    .select("model")
    .eq("id", agentId)
    .maybeSingle();
  const model = regRow?.model ?? "";

  try {
    await markStatus(row.id, { status: "in_flight", started_at: new Date().toISOString() });
    const turn = await runTurn(agentId, ENV_ID, task);
    const cost = costUsd(model, turn.usage);

    if (turn.error) {
      await markStatus(row.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        session_id: turn.session_id,
        tokens_in: turn.usage.input_tokens,
        tokens_out: turn.usage.output_tokens,
        cost_usd: cost,
        output: { error: turn.error },
      });
      return NextResponse.json({
        error: turn.error,
        task_id: row.id,
        session_id: turn.session_id,
        cost_usd: cost,
      }, { status: 502 });
    }

    await markStatus(row.id, {
      status: "done",
      completed_at: new Date().toISOString(),
      session_id: turn.session_id,
      tokens_in: turn.usage.input_tokens,
      tokens_out: turn.usage.output_tokens,
      cost_usd: cost,
      output: { text: turn.text },
    });

    return NextResponse.json({
      text: turn.text,
      task_id: row.id,
      session_id: turn.session_id,
      cost_usd: cost,
      tokens: turn.usage,
      auto_assign: autoAssignReason
        ? { role, reason: autoAssignReason, cost_usd: autoAssignCost }
        : undefined,
    });
  } catch (e: unknown) {
    await markStatus(row.id, { status: "failed" });
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, task_id: row.id }, { status: 500 });
  }
}
