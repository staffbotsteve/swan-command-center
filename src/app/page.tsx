"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AgentRoster } from "@/components/AgentRoster";
import { VaultPanel } from "@/components/VaultPanel";
import { DispatchPanel } from "@/components/DispatchPanel";
import { SessionViewer } from "@/components/SessionViewer";

interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  status?: string;
}

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

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<VaultSession[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedSession, setSelectedSession] = useState<VaultSession | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentError(null);
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgents(data.agents ?? []);
    } catch (e: unknown) {
      setAgentError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const loadVault = useCallback(async () => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const res = await fetch("/api/vault");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProjects(data.projects ?? []);
      setSessions(data.sessions ?? []);
    } catch (e: unknown) {
      setVaultError(e instanceof Error ? e.message : "Failed to load vault");
    } finally {
      setVaultLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
    loadVault();
  }, [loadAgents, loadVault]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-card-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Swan Command Center
            </h1>
            <p className="text-sm text-muted mt-0.5">
              Multi-company AI agent operations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 mr-4">
              <span className="px-3 py-1.5 text-sm rounded bg-accent/20 text-accent font-medium">
                Dashboard
              </span>
              <Link
                href="/assistant"
                className="px-3 py-1.5 text-sm rounded text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
              >
                Assistant
              </Link>
            </nav>
            <button
              onClick={() => {
                loadAgents();
                loadVault();
              }}
              className="px-3 py-1.5 text-sm border border-card-border rounded hover:bg-card-border/50 transition-colors"
            >
              Refresh
            </button>
            <a
              href="/api/auth/signout"
              className="px-3 py-1.5 text-sm border border-card-border rounded hover:bg-card-border/50 transition-colors"
            >
              Sign out
            </a>
            <div className="text-xs text-muted font-mono">
              {agents.length} departments · {sessions.length} sessions
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid grid-cols-12 gap-0 min-h-[calc(100vh-73px)]">
        {/* Left: Agent Roster */}
        <div className="col-span-3 border-r border-card-border overflow-y-auto">
          <AgentRoster
            agents={agents}
            loading={agentsLoading}
            error={agentError}
            selectedAgent={selectedAgent}
            onSelect={setSelectedAgent}
          />
        </div>

        {/* Center: Dispatch + Stream */}
        <div className="col-span-5 flex flex-col">
          <DispatchPanel
            agents={agents}
            selectedAgent={selectedAgent}
          />
        </div>

        {/* Right: Vault */}
        <div className="col-span-4 border-l border-card-border overflow-y-auto">
          {selectedSession ? (
            <SessionViewer
              session={selectedSession}
              onBack={() => setSelectedSession(null)}
            />
          ) : (
            <VaultPanel
              projects={projects}
              sessions={sessions}
              loading={vaultLoading}
              error={vaultError}
              onSessionSelect={setSelectedSession}
            />
          )}
        </div>
      </main>
    </div>
  );
}
