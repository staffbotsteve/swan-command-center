"use client";

interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  status?: string;
}

const ROLE_META: Record<string, { icon: string; tagline: string }> = {
  main:     { icon: "🧠", tagline: "Triage / fallback" },
  research: { icon: "🔍", tagline: "NotebookLM · YouTube · vault" },
  comms:    { icon: "📣", tagline: "Email · calendar · VIP screening" },
  content:  { icon: "✍️", tagline: "Scripts · posts · thumbnails" },
  ops:      { icon: "⚙️", tagline: "Finances · vendors · daily rollup" },
  legal:    { icon: "⚖️", tagline: "Entity-aware compliance" },
  dev:      { icon: "🛠️", tagline: "PR review · deploy triage · plans" },
};

function modelBadge(model: string): { label: string; color: string } {
  if (model.includes("opus")) return { label: "Opus", color: "bg-purple-500/20 text-purple-300" };
  if (model.includes("sonnet")) return { label: "Sonnet", color: "bg-blue-500/20 text-blue-300" };
  if (model.includes("haiku")) return { label: "Haiku", color: "bg-emerald-500/20 text-emerald-300" };
  return { label: model.split("-").slice(0, 2).join("-"), color: "bg-gray-500/20 text-gray-300" };
}

const ROLE_ORDER = ["main", "research", "comms", "content", "ops", "legal", "dev"];

export function AgentRoster({
  agents,
  loading,
  error,
  selectedAgent,
  onSelect,
}: {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  selectedAgent: Agent | null;
  onSelect: (a: Agent) => void;
}) {
  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Departments
        </h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-14 bg-card-border/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Departments
        </h2>
        <div className="p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  const sorted = [...agents].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a.role);
    const ib = ROLE_ORDER.indexOf(b.role);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Departments ({agents.length})
        </h2>
      </div>

      <div className="space-y-1.5">
        {sorted.map((agent) => {
          const meta = ROLE_META[agent.role] ?? {
            icon: "🤖",
            tagline: agent.role,
          };
          const badge = modelBadge(agent.model);
          const isSelected = selectedAgent?.id === agent.id;

          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent)}
              className={`w-full text-left px-3 py-2.5 rounded transition-colors border ${
                isSelected
                  ? "bg-accent/20 border-accent/40"
                  : "border-transparent hover:bg-card-border/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{agent.name}</div>
                    <div className="text-[11px] text-muted truncate">{meta.tagline}</div>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${badge.color}`}
                >
                  {badge.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {agents.length === 0 && (
        <p className="text-sm text-muted mt-4">
          No agents in registry. Run <code>bootstrap-agents.mjs</code>.
        </p>
      )}
    </div>
  );
}
