import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  let q = supabase()
    .from("memories")
    .select("*")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const kind = u.searchParams.get("kind");
  const min = u.searchParams.get("importance_min");
  if (kind) q = q.eq("kind", kind);
  if (min) q = q.gte("importance", Number(min));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary counts for dashboard header
  const { data: counts } = await supabase()
    .from("memories")
    .select("kind", { count: "exact" });
  const byKind: Record<string, number> = {};
  for (const row of counts ?? []) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;

  return NextResponse.json({ memories: data ?? [], counts: byKind });
}
