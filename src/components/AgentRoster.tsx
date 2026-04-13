"use client";

import { useState } from "react";

interface Agent {
  id: string;
  name: string;
  model: string;
}

const MODEL_BADGES: Record<string, { label: string; color: string }> = {
  "claude-opus-4-6": { label: "Opus", color: "bg-purple-500/20 text-purple-300" },
  "claude-sonnet-4-6": { label: "Sonnet", color: "bg-blue-500/20 text-blue-300" },
};

const ROLE_ICONS: Record<string, string> = {
  CEO: "\u{1F451}",
  Marketing: "\u{1F4E3}",
  Operations: "\u2699\uFE0F",
  Legal: "\u2696\uFE0F",
  Developer: "\u{1F4BB}",
  Research: "\u{1F50D}",
};

// Map agent name prefix to company
const COMPANY_PREFIXES: [string, string][] = [
  ["SwanBill", "SwanBill LLC"],
  ["Providence", "Providence Fire & Rescue"],
  ["E2S Transport", "E2S Transportation LLC"],
  ["E2S AZ", "E2S Properties AZ LLC"],
  ["E2S Props", "e2s Properties LLC"],
  ["Hosp CA", "e2s Hospitality CA LLC"],
  ["Hosp NV", "e2s Hospitality NV LLC"],
  ["Daily Rollup", "Operations"],
];

function getCompany(name: string): string {
  for (const [prefix, company] of COMPANY_PREFIXES) {
    if (name.startsWith(prefix)) return company;
  }
  return "Other";
}

function getRole(name: string): string {
  for (const role of ["CEO", "Marketing", "Operations", "Legal", "Developer", "Research"]) {
    if (name.includes(role)) return role;
  }
  return "";
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
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    new Set()
  );

  function toggleCompany(company: string) {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) {
        next.delete(company);
      } else {
        next.add(company);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Agent Roster
        </h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-card-border/30 rounded animate-pulse" />
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

  // Group agents by company, with role ordering
  const groups: Record<string, Agent[]> = {};
  for (const agent of agents) {
    const company = getCompany(agent.name);
    if (!groups[company]) groups[company] = [];
    groups[company].push(agent);
  }

  // Sort agents within each group: CEO first, then alphabetical
  const roleOrder = ["CEO", "Marketing", "Operations", "Legal", "Developer", "Research"];
  for (const company of Object.keys(groups)) {
    groups[company].sort((a, b) => {
      const aRole = roleOrder.indexOf(getRole(a.name));
      const bRole = roleOrder.indexOf(getRole(b.name));
      return (aRole === -1 ? 99 : aRole) - (bRole === -1 ? 99 : bRole);
    });
  }

  // Define display order for companies
  const companyOrder = [
    "SwanBill LLC",
    "Providence Fire & Rescue",
    "E2S Transportation LLC",
    "E2S Properties AZ LLC",
    "e2s Properties LLC",
    "e2s Hospitality CA LLC",
    "e2s Hospitality NV LLC",
    "Operations",
    "Other",
  ];

  const sortedCompanies = Object.keys(groups).sort(
    (a, b) =>
      (companyOrder.indexOf(a) === -1 ? 99 : companyOrder.indexOf(a)) -
      (companyOrder.indexOf(b) === -1 ? 99 : companyOrder.indexOf(b))
  );

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
        Agent Roster ({agents.length})
      </h2>

      <div className="space-y-1">
        {sortedCompanies.map((company) => {
          const companyAgents = groups[company];
          const isExpanded = expandedCompanies.has(company);
          const hasSelected = companyAgents.some(
            (a) => a.id === selectedAgent?.id
          );

          return (
            <div key={company}>
              {/* Company header — collapsible */}
              <button
                onClick={() => toggleCompany(company)}
                className={`w-full text-left px-3 py-2 rounded transition-colors ${
                  hasSelected
                    ? "bg-accent/10"
                    : "hover:bg-card-border/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {company}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted font-mono">
                      {companyAgents.length}
                    </span>
                    <span className="text-xs text-muted">
                      {isExpanded ? "\u25BC" : "\u25B6"}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded agents */}
              {isExpanded && (
                <div className="ml-2 border-l border-card-border pl-1 mb-1">
                  {companyAgents.map((agent) => {
                    const badge = MODEL_BADGES[agent.model] ?? {
                      label: agent.model.split("-").pop(),
                      color: "bg-gray-500/20 text-gray-300",
                    };
                    const role = getRole(agent.name);
                    const icon = ROLE_ICONS[role] ?? "";
                    const isSelected = selectedAgent?.id === agent.id;

                    return (
                      <button
                        key={agent.id}
                        onClick={() => onSelect(agent)}
                        className={`w-full text-left px-3 py-1.5 rounded transition-colors ${
                          isSelected
                            ? "bg-accent/20 border border-accent/40"
                            : "hover:bg-card-border/30 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm truncate">
                            {icon ? `${icon} ` : ""}
                            {role || agent.name}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {agents.length === 0 && (
        <p className="text-sm text-muted mt-4">
          No agents found. Deploy agents first.
        </p>
      )}
    </div>
  );
}
