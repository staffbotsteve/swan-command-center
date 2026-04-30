import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ProjectOption {
  project: string;
  company: string | null;
}

/**
 * Distinct projects discovered in channel_routing — what the dashboard
 * dispatch panel offers as project tags. Each project carries its
 * company forward so we don't need a second picker.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase()
    .from("channel_routing")
    .select("project, company")
    .not("project", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dedupe on (project, company).
  const seen = new Set<string>();
  const projects: ProjectOption[] = [];
  for (const row of data ?? []) {
    if (!row.project) continue;
    const key = `${row.project}|${row.company ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    projects.push({ project: row.project, company: row.company ?? null });
  }
  projects.sort((a, b) => a.project.localeCompare(b.project));

  return NextResponse.json({ projects });
}
