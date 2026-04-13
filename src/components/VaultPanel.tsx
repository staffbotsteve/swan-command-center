"use client";

import { useState } from "react";

interface Project {
  name: string;
  path: string;
  company?: string;
  context?: string;
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

const COMPANY_COLORS: Record<string, string> = {
  "SwanBill LLC": "bg-blue-500/20 text-blue-300",
  "Providence Fire & Rescue Inc.": "bg-red-500/20 text-red-300",
  "E2S Transportation LLC": "bg-cyan-500/20 text-cyan-300",
  "E2S Properties AZ LLC": "bg-amber-500/20 text-amber-300",
  "e2s Properties LLC": "bg-orange-500/20 text-orange-300",
  "e2s Hospitality California LLC": "bg-pink-500/20 text-pink-300",
  "e2s Hospitality NV LLC": "bg-violet-500/20 text-violet-300",
};

function companyBadge(company?: string): string {
  if (!company) return "bg-gray-500/20 text-gray-300";
  return COMPANY_COLORS[company] ?? "bg-gray-500/20 text-gray-300";
}

function shortCompany(company?: string): string {
  if (!company) return "";
  return company
    .replace(" LLC", "")
    .replace(" Inc.", "")
    .replace("e2s Hospitality California", "Hosp CA")
    .replace("e2s Hospitality NV", "Hosp NV")
    .replace("E2S Properties AZ", "E2S AZ")
    .replace("e2s Properties", "E2S Props")
    .replace("E2S Transportation", "E2S Transport")
    .replace("Providence Fire & Rescue", "Providence");
}

export function VaultPanel({
  projects,
  sessions,
  loading,
  error,
  onSessionSelect,
}: {
  projects: Project[];
  sessions: VaultSession[];
  loading: boolean;
  error: string | null;
  onSessionSelect: (s: VaultSession) => void;
}) {
  const [tab, setTab] = useState<"projects" | "sessions">("projects");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

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
          onClick={() => setTab("projects")}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            tab === "projects"
              ? "bg-accent/20 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Projects ({projects.length})
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

      {/* Projects */}
      {tab === "projects" && (
        <div className="space-y-1">
          {projects.map((p) => (
            <div key={p.name}>
              <button
                onClick={() =>
                  setExpandedProject(
                    expandedProject === p.name ? null : p.name
                  )
                }
                className="w-full text-left px-3 py-2.5 rounded hover:bg-card-border/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {p.name.replace(/-/g, " ")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {p.company && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${companyBadge(
                          p.company
                        )}`}
                      >
                        {shortCompany(p.company)}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {expandedProject === p.name ? "\u25BC" : "\u25B6"}
                    </span>
                  </div>
                </div>
              </button>
              {expandedProject === p.name && p.context && (
                <div className="mx-3 mb-2 px-3 py-2 bg-card border border-card-border rounded">
                  <pre className="text-xs text-muted whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {p.context}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-sm text-muted">No projects in vault</p>
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
