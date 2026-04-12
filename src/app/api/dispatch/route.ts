import { NextRequest, NextResponse } from "next/server";
import { createSession, sendMessage, streamSession } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const ENV_ID = process.env.SWAN_ENV_ID ?? "env_01L4sqBNP3fo5hPLPSTtq7P1";

export async function POST(req: NextRequest) {
  try {
    const { agentId, task } = await req.json();
    if (!agentId || !task) {
      return NextResponse.json(
        { error: "agentId and task are required" },
        { status: 400 }
      );
    }

    // Create session
    const session = await createSession(agentId, ENV_ID);

    // Send the task message
    await sendMessage(session.id, task);

    // Stream the response back
    const streamRes = await streamSession(session.id);
    if (!streamRes.ok) {
      const err = await streamRes.text();
      return NextResponse.json(
        { error: `Stream failed: ${streamRes.status} ${err}` },
        { status: 502 }
      );
    }

    // Forward the SSE stream
    return new Response(streamRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
