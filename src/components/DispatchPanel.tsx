"use client";

import { useState, useRef, useEffect } from "react";

interface Agent {
  id: string;
  name: string;
  role?: string;
  model: string;
}

export function DispatchPanel({
  agents,
  selectedAgent,
}: {
  agents: Agent[];
  selectedAgent: Agent | null;
}) {
  const [agentId, setAgentId] = useState("");
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const effectiveAgentId = selectedAgent?.id ?? agentId;

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  async function dispatch() {
    if (!effectiveAgentId || !task.trim()) return;
    setRunning(true);
    setOutput("");
    setError(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: effectiveAgentId,
          role: selectedAgent?.role,
          task: task.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setOutput(data.text ?? "(empty response)");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Dispatch form */}
      <div className="p-4 border-b border-card-border">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
          Dispatch Task
        </h2>

        <div className="mb-3">
          <select
            value={effectiveAgentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full bg-card border border-card-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
          >
            <option value="">Select an agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.model.includes("opus") ? "Opus" : a.model.includes("haiku") ? "Haiku" : "Sonnet"})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe the task to dispatch..."
            rows={3}
            className="w-full bg-card border border-card-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) dispatch();
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={dispatch}
            disabled={running || !effectiveAgentId || !task.trim()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? "Running..." : "Dispatch"}
          </button>
          <span className="text-xs text-muted">Cmd+Enter to send</span>
        </div>
      </div>

      {/* Output */}
      <div ref={outputRef} className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {error && (
          <div className="mb-3 p-3 bg-danger/10 border border-danger/30 rounded text-danger text-sm">
            {error}
          </div>
        )}
        {output ? (
          <pre className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
            {output}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            {running ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Agent working...
              </div>
            ) : (
              "Select an agent and dispatch a task"
            )}
          </div>
        )}
      </div>
    </div>
  );
}
