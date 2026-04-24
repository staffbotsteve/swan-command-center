import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Returns the agent roster for the dashboard.
 * Reads from `agent_registry` (Supabase) rather than Anthropic directly, so
 * the UI reflects promotion state and sub-agent activity — not just what's
 * registered on the Managed Agents side.
 */
export async function GET() {
  try {
    const { data, error } = await supabase()
      .from("agent_registry")
      .select("id, role, display_name, model, status")
      .in("status", ["permanent", "awaiting_promotion"])
      .order("role", { ascending: true });
    if (error) throw error;

    const agents = (data ?? []).map((r) => ({
      id: r.id,
      name: r.display_name,
      role: r.role,
      model: r.model,
      status: r.status,
    }));

    return NextResponse.json({ agents });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
