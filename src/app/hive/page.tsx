"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { Task } from "@/types/db";

const STATUS_ORDER = ["queued", "in_flight", "awaiting_user", "done", "failed"] as const;

const STATUS_META: Record<(typeof STATUS_ORDER)[number], { label: string; color: string }> = {
  queued:         { label: "Queued",        color: "bg-gray-500/20 text-gray-300 border-gray-500/40" },
  in_flight:      { label: "In flight",     color: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  awaiting_user:  { label: "Awaiting you",  color: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  done:           { label: "Done",          color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  failed:         { label: "Failed",        color: "bg-red-500/20 text-red-300 border-red-500/40" },
};

function roleIcon(agent_id: string, roleMap: Record<string, string>): string {
  const role = roleMap[agent_id];
  return { main: "🧠", research: "🔍", comms: "📣", content: "✍️", ops: "⚙️", legal: "⚖️", dev: "🛠️" }[role] ?? "🤖";
}

function relative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function HivePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCompany, setFilterCompany] = useState("");
  const [filterProject, setFilterProject] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterCompany) params.set("company", filterCompany);
      if (filterProject) params.set("project", filterProject);
      const [hiveRes, agentsRes] = await Promise.all([
        fetch(`/api/hive?${params.toString()}`),
        fetch("/api/agents"),
      ]);
      const hive = await hiveRes.json();
      const ag = await agentsRes.json();
      if (hive.error) throw new Error(hive.error);
      if (ag.error) throw new Error(ag.error);
      setTasks(hive.tasks ?? []);
      const map: Record<string, string> = {};
      for (const a of ag.agents ?? []) map[a.id] = a.role;
      setRoleMap(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filterCompany, filterProject]);

  useEffect(() => { load(); }, [load]);

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    tasks: tasks.filter((t) => t.status === s),
  }));

  return (
    <div className="min-h-screen">
      <header className="border-b border-card-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Hive Mind</h1>
            <p className="text-sm text-muted mt-0.5">
              Every agent's work, cross-readable. {tasks.length} recent tasks.
            </p>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/" className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30">Dashboard</Link>
            <span className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent font-medium">Hive</span>
            <Link href="/memory" className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30">Memory</Link>
            <Link href="/registry" className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30">Registry</Link>
            <Link href="/assistant" className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30">Assistant</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 mt-3 text-sm">
          <input
            type="text"
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            placeholder="filter company..."
            className="px-2 py-1 bg-card border border-card-border rounded text-xs w-48"
          />
          <input
            type="text"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            placeholder="filter project..."
            className="px-2 py-1 bg-card border border-card-border rounded text-xs w-48"
          />
          <button
            onClick={load}
            className="px-3 py-1 text-xs border border-card-border rounded hover:bg-card-border/50"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="p-6">
        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">{error}</div>
        )}
        {loading && !tasks.length ? (
          <div className="text-muted text-sm">Loading hive...</div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {grouped.map(({ status, tasks: group }) => (
              <div key={status} className="flex flex-col min-h-[60vh]">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{STATUS_META[status].label}</span>
                  <span className="text-[10px] text-muted font-mono">{group.length}</span>
                </div>
                <div className="space-y-2">
                  {group.length === 0 && <div className="text-[11px] text-dim px-1">—</div>}
                  {group.map((t) => {
                    const input = (t.input as { text?: string; sender?: string } | null) ?? {};
                    const preview = (input.text ?? "").slice(0, 120);
                    return (
                      <div
                        key={t.id}
                        className={`p-2.5 rounded border ${STATUS_META[status].color} bg-card/50`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-base">{roleIcon(t.agent_id, roleMap)}</span>
                          <span className="text-[9px] font-mono text-muted">{relative(t.created_at)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-foreground/90 line-clamp-3 leading-snug">
                          {preview || "(no input text)"}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {t.channel && <span className="text-[9px] px-1 py-px rounded bg-card-border/50 text-muted font-mono">{t.channel}</span>}
                          {t.company && <span className="text-[9px] px-1 py-px rounded bg-card-border/50 text-muted font-mono">{t.company}</span>}
                          {t.project && <span className="text-[9px] px-1 py-px rounded bg-card-border/50 text-muted font-mono">{t.project}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
