import { NextResponse } from "next/server";
import { listProjects, listSessions } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [projects, sessions] = await Promise.all([
      listProjects(),
      listSessions(),
    ]);
    return NextResponse.json({ projects, sessions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
