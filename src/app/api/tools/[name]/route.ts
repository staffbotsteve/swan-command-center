import { NextRequest, NextResponse } from "next/server";
import { getTool } from "@/tools";
// Force all tool files to register via their side-effect imports in src/tools/index.ts
import "@/tools";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const tool = getTool(name);
  if (!tool) {
    return NextResponse.json(
      { error: `unknown tool '${name}'`, known: [] },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await tool.handler(body, {
      agent_id: req.headers.get("x-agent-id") ?? "anon",
      task_id: req.headers.get("x-task-id") ?? null,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), tool: name },
      { status: 500 }
    );
  }
}
