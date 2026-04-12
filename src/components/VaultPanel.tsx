"use client";

import { useState } from "react";

interface Project {
  name: string;
  path: string;
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
        <div className="space-y-2">
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
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {p.name.replace(/-/g, " ")}
                  </span>
                  <span className="text-xs text-muted">
                    {expandedProject === p.name ? "v" : ">"}
                  </span>
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
