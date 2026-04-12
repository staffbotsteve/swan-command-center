"use client";

interface Agent {
  id: string;
  name: string;
  model: string;
}

const MODEL_BADGES: Record<string, { label: string; color: string }> = {
  "claude-opus-4-6": { label: "Opus", color: "bg-purple-500/20 text-purple-300" },
  "claude-sonnet-4-6": { label: "Sonnet", color: "bg-blue-500/20 text-blue-300" },
};

const COMPANY_MAP: Record<string, string> = {
  "Providence": "Providence Fire & Rescue",
  "e2s": "e2s Holdings",
  "Swan": "Swan Ventures",
};

function getCompany(name: string): string {
  for (const [key, val] of Object.entries(COMPANY_MAP)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return "Other";
}

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
          Agent Roster
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-card-border/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Agent Roster
        </h2>
        <div className="p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  // Group by company
  const groups: Record<string, Agent[]> = {};
  for (const agent of agents) {
    const company = getCompany(agent.name);
    if (!groups[company]) groups[company] = [];
    groups[company].push(agent);
  }

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
        Agent Roster ({agents.length})
      </h2>
      {Object.entries(groups).map(([company, agentList]) => (
        <div key={company} className="mb-4">
          <h3 className="text-xs font-medium text-muted mb-2">{company}</h3>
          <div className="space-y-1">
            {agentList.map((agent) => {
              const badge = MODEL_BADGES[agent.model] ?? {
                label: agent.model.split("-").pop(),
                color: "bg-gray-500/20 text-gray-300",
              };
              const isSelected = selectedAgent?.id === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => onSelect(agent)}
                  className={`w-full text-left px-3 py-2.5 rounded transition-colors ${
                    isSelected
                      ? "bg-accent/20 border border-accent/40"
                      : "hover:bg-card-border/30 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">
                      {agent.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted font-mono mt-0.5 truncate">
                    {agent.id}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {agents.length === 0 && (
        <p className="text-sm text-muted">
          No agents found. Deploy agents first using deploy-agents-v2.sh
        </p>
      )}
    </div>
  );
}
