"use client";

import { useEffect, useState } from "react";

interface VaultSession {
  name: string;
  path: string;
  date?: string;
  source?: string;
}

export function SessionViewer({
  session,
  onBack,
}: {
  session: VaultSession;
  onBack: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/vault/session?path=${encodeURIComponent(session.path)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContent(data.content);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session.path]);

  return (
    <div className="p-4">
      <button
        onClick={onBack}
        className="text-xs text-muted hover:text-foreground mb-3 flex items-center gap-1"
      >
        &larr; Back to vault
      </button>

      <h2 className="text-sm font-semibold mb-1">
        {session.name.replace(/^\d{4}-\d{2}-\d{2}-?/, "").replace(/-/g, " ")}
      </h2>
      <div className="flex items-center gap-2 mb-4">
        {session.date && (
          <span className="text-[10px] text-muted">{session.date}</span>
        )}
        {session.source && (
          <span className="text-[10px] text-muted font-mono">
            {session.source}
          </span>
        )}
      </div>

      {loading && (
        <div className="h-32 bg-card-border/30 rounded animate-pulse" />
      )}
      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
          {error}
        </div>
      )}
      {content && (
        <div className="bg-card border border-card-border rounded p-4">
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
