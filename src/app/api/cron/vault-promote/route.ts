import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { writeVaultFile } from "@/lib/vault-write";
import type { Memory } from "@/types/db";

export const dynamic = "force-dynamic";

/**
 * Weekly vault promotion. Distills high-importance hot memories into
 * markdown files under the vault's Insights tree. Stamps each promoted
 * memory with promoted_to_vault_at + vault_path.
 *
 * Trigger sources:
 *  - Vercel Cron (per vercel.json schedule). Vercel sends CRON_SECRET as
 *    the "authorization: Bearer" header when configured.
 *  - Manual POST with the same bearer for ad-hoc runs.
 */
export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = supabase();
  const { data, error } = await sb
    .from("memories")
    .select("*")
    .gte("importance", 0.7)
    .is("promoted_to_vault_at", null)
    .in("kind", ["fact", "pinned", "context"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memories = (data ?? []) as Memory[];
  if (memories.length === 0) {
    return NextResponse.json({ promoted: 0, groups: 0 });
  }

  // Group by (company, project, yyyy-mm)
  const groups = new Map<string, Memory[]>();
  for (const m of memories) {
    const ym = m.created_at.slice(0, 7);
    const key = `${m.company ?? "all"}|${m.project ?? "general"}|${ym}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  let promoted = 0;
  const results: { group: string; path: string; count: number }[] = [];

  for (const [key, rows] of groups) {
    const [, project, ym] = key.split("|");
    const path = project === "general"
      ? `02-Areas/Memory/Insights/${ym}.md`
      : `01-Projects/${project}/memory-${ym}.md`;
    const body = buildMarkdown(key, rows);
    await writeVaultFile(path, body, `cron: promote ${rows.length} memories for ${key}`);

    const ids = rows.map((r) => r.id);
    const { error: updateErr } = await sb
      .from("memories")
      .update({
        promoted_to_vault_at: new Date().toISOString(),
        vault_path: path,
      })
      .in("id", ids);
    if (updateErr) {
      // best-effort: log but keep going with other groups
      console.error(`update failed for ${key}: ${updateErr.message}`);
      continue;
    }
    promoted += ids.length;
    results.push({ group: key, path, count: ids.length });
  }

  return NextResponse.json({ promoted, groups: groups.size, results });
}

function buildMarkdown(key: string, rows: Memory[]): string {
  const [company, project, ym] = key.split("|");
  const lines = [
    `# Insights · ${company} / ${project} · ${ym}`,
    "",
    `_Promoted ${rows.length} memories on ${new Date().toISOString().slice(0, 10)}._`,
    "",
  ];
  for (const r of rows.sort((a, b) => b.importance - a.importance)) {
    lines.push(`## ${r.kind} · importance ${r.importance.toFixed(2)}`);
    lines.push("");
    lines.push(r.body);
    if (r.tags.length) {
      lines.push("");
      lines.push(`Tags: ${r.tags.map((t) => `\`${t}\``).join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
