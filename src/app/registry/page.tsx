"use client";

import { useEffect, useState, useCallback } from "react";
import type { AgentRegistryEntry, SkillRegistryEntry } from "@/types/db";
import { Header } from "@/components/Header";

type Tab = "personas" | "agents" | "skills";

interface Persona {
  role: string;
  title: string;
  model: string;
  department: string;
  personality: string;
}

const AGENT_STATUS_META: Record<string, string> = {
  permanent: "bg-emerald-500/20 text-emerald-300",
  ephemeral: "bg-amber-500/20 text-amber-300",
  awaiting_promotion: "bg-accent/20 text-accent",
  archived: "bg-gray-500/20 text-gray-300",
};

const SKILL_STATUS_META: Record<string, string> = {
  standard: "bg-emerald-500/20 text-emerald-300",
  experimental: "bg-amber-500/20 text-amber-300",
  pr_pending: "bg-accent/20 text-accent",
  archived: "bg-gray-500/20 text-gray-300",
};

const ROLE_EMOJI: Record<string, string> = {
  main: "🧠",
  research: "🔍",
  comms: "📣",
  content: "✍️",
  ops: "⚙️",
  legal: "⚖️",
  dev: "🛠️",
};

export default function RegistryPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [agents, setAgents] = useState<AgentRegistryEntry[]>([]);
  const [skills, setSkills] = useState<SkillRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("personas");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a, s] = await Promise.all([
        fetch("/api/agents/personas").then((r) => r.json()),
        fetch("/api/registry/agents").then((r) => r.json()),
        fetch("/api/registry/skills").then((r) => r.json()),
      ]);
      if (a.error) throw new Error(a.error);
      if (s.error) throw new Error(s.error);
      setPersonas(p.personas ?? []);
      setAgents(a.agents ?? []);
      setSkills(s.skills ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen">
      <Header
        title="Registry"
        subtitle="Every agent and skill, permanent and ephemeral. Promotion happens here."
      />

      <main className="p-6 max-w-5xl mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">{error}</div>
        )}

        <div className="flex gap-0.5 border-b border-card-border mb-4 -mb-px">
          <button
            onClick={() => setTab("personas")}
            className={`px-4 py-3 text-sm border-b-2 ${tab === "personas" ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}
          >
            Personas ({personas.length})
          </button>
          <button
            onClick={() => setTab("agents")}
            className={`px-4 py-3 text-sm border-b-2 ${tab === "agents" ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}
          >
            Agents ({agents.length})
          </button>
          <button
            onClick={() => setTab("skills")}
            className={`px-4 py-3 text-sm border-b-2 ${tab === "skills" ? "border-accent text-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}
          >
            Skills ({skills.length})
          </button>
        </div>

        {loading ? (
          <div className="text-muted text-sm">Loading registry...</div>
        ) : tab === "personas" ? (
          <div className="space-y-3">
            {personas.length === 0 ? (
              <div className="text-muted text-sm p-8 text-center border border-dashed border-card-border rounded">No agent prompts found.</div>
            ) : personas.map((p) => (
              <div key={p.role} className="p-4 rounded border border-card-border bg-card/50">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{ROLE_EMOJI[p.role] ?? "🤖"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold">{p.title}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/20 text-accent">{p.role}</span>
                    </div>
                    <div className="text-[11px] text-muted font-mono mt-0.5">{p.model}</div>
                  </div>
                </div>
                {p.personality ? (
                  <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">{p.personality}</p>
                ) : (
                  <p className="text-sm text-muted italic">No personality block defined yet.</p>
                )}
              </div>
            ))}
          </div>
        ) : tab === "agents" ? (
          <div className="space-y-1.5">
            {agents.length === 0 ? (
              <div className="text-muted text-sm p-8 text-center border border-dashed border-card-border rounded">No agents registered.</div>
            ) : agents.map((a) => (
              <div key={a.id} className="p-3 rounded border border-card-border bg-card/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{a.display_name}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${AGENT_STATUS_META[a.status] ?? ""}`}>{a.status}</span>
                      <span className="text-[10px] text-muted font-mono">{a.role}</span>
                    </div>
                    <div className="text-[11px] text-muted font-mono mt-0.5">{a.id} · {a.model}</div>
                  </div>
                  <div className="text-[10px] text-dim font-mono shrink-0">
                    {a.promoted_at ? `promoted ${new Date(a.promoted_at).toLocaleDateString()}` : `created ${new Date(a.created_at).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {skills.length === 0 ? (
              <div className="text-muted text-sm p-8 text-center border border-dashed border-card-border rounded">
                No skills registered yet. Tools are defined in code (src/tools/*) and get upserted here once Task 18's sync runs.
              </div>
            ) : skills.map((s) => (
              <div key={s.name} className="p-3 rounded border border-card-border bg-card/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{s.name}</code>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${SKILL_STATUS_META[s.status] ?? ""}`}>{s.status}</span>
                      <span className="text-[10px] text-muted font-mono">{s.source}</span>
                    </div>
                    {s.description && <div className="text-[11px] text-muted mt-0.5 line-clamp-2">{s.description}</div>}
                  </div>
                  <div className="text-[10px] text-dim font-mono shrink-0 space-y-0.5 text-right">
                    <div>use: {s.install_count}</div>
                    <div>✓ {s.success_count} · ✗ {s.failure_count}</div>
                  </div>
                </div>
                {s.pr_url && (
                  <a href={s.pr_url} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline mt-1 inline-block">
                    {s.pr_url}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
