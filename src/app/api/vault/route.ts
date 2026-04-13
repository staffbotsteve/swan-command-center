import { NextResponse } from "next/server";
import { listCompanies, listSessions } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [companies, sessions] = await Promise.all([
      listCompanies(),
      listSessions(),
    ]);
    return NextResponse.json({ companies, sessions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
