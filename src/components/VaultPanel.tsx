"use client";

import { useState } from "react";

interface Project {
  name: string;
  path: string;
  context?: string;
}

interface Company {
  name: string;
  path: string;
  context?: string;
  projects: Project[];
}

interface VaultSession {
  name: string;
  path: string;
  date?: string;
  source?: string;
}

const SOURCE_BADGES: Record<string, string> = {
  Code: "bg-green-500/20 text-green-300",
  Cowork: "bg-yellow-500/20 text-yellow-300",
  "Managed-Agents": "bg-purple-500/20 text-purple-300",
};

export function VaultPanel({
  companies,
  sessions,
  loading,
  error,
  onSessionSelect,
}: {
  companies: Company[];
  sessions: VaultSession[];
  loading: boolean;
  error: string | null;
  onSessionSelect: (s: VaultSession) => void;
}) {
  const [tab, setTab] = useState<"companies" | "sessions">("companies");
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const totalProjects = companies.reduce(
    (sum, c) => sum + c.projects.length,
    0
  );

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Vault
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-card-border/30 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Vault
        </h2>
        <div className="p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
        Vault
      </h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab("companies")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            tab === "companies"
              ? "bg-accent/20 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Companies ({companies.length}) / Projects ({totalProjects})
        </button>
        <button
          onClick={() => setTab("sessions")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            tab === "sessions"
              ? "bg-accent/20 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Sessions ({sessions.length})
        </button>
      </div>

      {/* Companies & Projects */}
      {tab === "companies" && (
        <div className="space-y-1">
          {companies.map((c) => (
            <div key={c.name}>
              {/* Company header */}
              <button
                onClick={() =>
                  setExpandedCompany(
                    expandedCompany === c.name ? null : c.name
                  )
                }
                className="w-full text-left px-3 py-2.5 rounded hover:bg-card-border/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {c.name.replace(/-/g, " ")}
                  </span>
                  <div className="flex items-center gap-2">
                    {c.projects.length > 0 && (
                      <span className="text-[10px] font-mono text-muted px-1.5 py-0.5 bg-card-border/40 rounded">
                        {c.projects.length} project
                        {c.projects.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {expandedCompany === c.name ? "\u25BC" : "\u25B6"}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded: show projects */}
              {expandedCompany === c.name && (
                <div className="ml-3 border-l border-card-border pl-2 mb-2">
                  {c.projects.map((p) => (
                    <div key={p.path}>
                      <button
                        onClick={() =>
                          setExpandedProject(
                            expandedProject === p.path ? null : p.path
                          )
                        }
                        className="w-full text-left px-3 py-2 rounded hover:bg-card-border/30 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm">
                            {p.name.replace(/-/g, " ")}
                          </span>
                          <span className="text-xs text-muted">
                            {expandedProject === p.path ? "\u25BC" : "\u25B6"}
                          </span>
                        </div>
                      </button>
                      {expandedProject === p.path && p.context && (
                        <div className="mx-3 mb-2 px-3 py-2 bg-card border border-card-border rounded">
                          <pre className="text-xs text-muted whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                            {p.context}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                  {c.projects.length === 0 && (
                    <p className="text-xs text-muted px-3 py-2">
                      No sub-projects
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          {companies.length === 0 && (
            <p className="text-sm text-muted">No companies in vault</p>
          )}
        </div>
      )}

      {/* Sessions */}
      {tab === "sessions" && (
        <div className="space-y-1">
          {sessions.map((s) => (
            <button
              key={s.path}
              onClick={() => onSessionSelect(s)}
              className="w-full text-left px-3 py-2.5 rounded hover:bg-card-border/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm truncate">
                  {s.name.replace(/^\d{4}-\d{2}-\d{2}-?/, "")}
                </span>
                {s.source && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      SOURCE_BADGES[s.source] ?? "bg-gray-500/20 text-gray-300"
                    }`}
                  >
                    {s.source === "Managed-Agents" ? "Agent" : s.source}
                  </span>
                )}
              </div>
              {s.date && (
                <div className="text-[10px] text-muted mt-0.5">{s.date}</div>
              )}
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted">No sessions found</p>
          )}
        </div>
      )}
    </div>
  );
}
