import { NextResponse } from "next/server";
import { listAgents } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agents = await listAgents();
    return NextResponse.json({ agents });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
