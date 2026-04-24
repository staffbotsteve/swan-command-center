import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  let q = supabase()
    .from("skill_registry")
    .select("*")
    .order("name");
  const status = u.searchParams.get("status");
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ skills: data ?? [] });
}
