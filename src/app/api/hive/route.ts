import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  let q = supabase()
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(200, parseInt(u.searchParams.get("limit") ?? "100", 10) || 100));

  const agent_id = u.searchParams.get("agent_id");
  const company = u.searchParams.get("company");
  const project = u.searchParams.get("project");
  const status = u.searchParams.get("status");
  if (agent_id) q = q.eq("agent_id", agent_id);
  if (company) q = q.eq("company", company);
  if (project) q = q.eq("project", project);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}
