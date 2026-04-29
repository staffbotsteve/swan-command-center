"use client";

import { useEffect, useState, useCallback } from "react";
import type { Memory } from "@/types/db";
import { Header } from "@/components/Header";

type Tab = "pinned" | "insights" | "preferences" | "decaying";

const TABS: { id: Tab; label: string; filter: (m: Memory) => boolean }[] = [
  { id: "pinned",      label: "Pinned",      filter: (m) => m.kind === "pinned" },
  { id: "insights",    label: "Insights",    filter: (m) => (m.kind === "fact" || m.kind === "context") && m.importance >= 0.6 },
  { id: "preferences", label: "Preferences", filter: (m) => m.kind === "preference" },
  { id: "decaying",    label: "Decaying",    filter: (m) => !!m.ttl_days },
];

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pinned");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMemories(data.memories ?? []);
      setCounts(data.counts ?? {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTab = TABS.find((t) => t.id === tab)!;
  const visible = memories.filter(activeTab.filter);

  return (
    <div className="min-h-screen">
      <Header
        title="Memory"
        subtitle="Hot store. Pinned stay forever. High-importance promoted to vault weekly."
      />

      <main className="p-6 max-w-4xl mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">{error}</div>
        )}

        <div className="flex gap-0.5 -mb-px border-b border-card-border mb-4">
          {TABS.map((t) => {
            const count = memories.filter(t.filter).length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-accent text-accent font-medium"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {t.label} <span className="text-muted">({count})</span>
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="py-3 text-xs text-muted font-mono">
            total: {memories.length} · fact:{counts.fact ?? 0} · pref:{counts.preference ?? 0} · ctx:{counts.context ?? 0} · pin:{counts.pinned ?? 0}
          </div>
        </div>

        {loading && !memories.length ? (
          <div className="text-muted text-sm">Loading memory...</div>
        ) : visible.length === 0 ? (
          <div className="text-muted text-sm p-8 text-center border border-dashed border-card-border rounded">
            Nothing in <em>{activeTab.label.toLowerCase()}</em> yet. Agents will populate this as they work.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((m) => (
              <div key={m.id} className="p-3 rounded border border-card-border bg-card/50">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm flex-1 leading-relaxed">{m.body}</p>
                  <span className="text-[10px] font-mono text-muted shrink-0">
                    {(m.importance * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-muted px-1.5 py-0.5 rounded bg-card-border/40">{m.kind}</span>
                  {m.tags.map((t, i) => (
                    <span key={i} className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded font-mono">{t}</span>
                  ))}
                  {m.company && <span className="text-[9px] text-muted font-mono">· {m.company}</span>}
                  {m.project && <span className="text-[9px] text-muted font-mono">· {m.project}</span>}
                  {m.ttl_days && <span className="text-[9px] text-amber-400 font-mono">· ttl {m.ttl_days}d</span>}
                  {m.promoted_to_vault_at && <span className="text-[9px] text-emerald-400 font-mono">· vault</span>}
                  <span className="flex-1" />
                  <span className="text-[9px] text-dim font-mono">{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
