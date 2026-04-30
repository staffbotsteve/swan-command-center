"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";

interface WarRoomTranscriptLine {
  who: "you" | "assistant" | "tool";
  text: string;
  ts: number;
}

const LAUNCH_CMD = "./companion/war-room/run.sh";
const PROJECT_ROOT = "/Users/stevenswan/project-folders/swan-command-center/app";

const ROLE_PRESENT: { emoji: string; label: string; sub: string }[] = [
  { emoji: "🧠", label: "Main",     sub: "router" },
  { emoji: "🔍", label: "Research", sub: "NotebookLM, vault, web" },
  { emoji: "📣", label: "Comms",    sub: "Slack, calendar, gmail" },
  { emoji: "✍️", label: "Content",  sub: "scripts, posts, image gen" },
  { emoji: "⚙️", label: "Ops",      sub: "stripe, vendors, recon" },
  { emoji: "⚖️", label: "Legal",    sub: "compliance, contracts" },
  { emoji: "🛠️", label: "Dev",      sub: "code review, plans, deploys" },
];

export default function WarRoomPage() {
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<WarRoomTranscriptLine[]>([]);
  const [showCommand, setShowCommand] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [transcript]);

  // v1: just toggle visual state. v2 will open a browser-native audio
  // loop via Gemini Live ephemeral tokens.
  function toggleSession() {
    if (running) {
      setRunning(false);
      setTranscript((t) => [...t, { who: "assistant", text: "Session ended.", ts: Date.now() }]);
    } else {
      setRunning(true);
      setTranscript((t) => [...t, { who: "assistant", text: "Voice loop ready. Open Terminal at your Mac and run the launch command. I'll mirror the transcript here once browser-native audio ships in v2.", ts: Date.now() }]);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        title="War Room"
        subtitle="Hands-free voice channel. Speak to the council; the transcript and tool calls land here."
      />

      <main className="flex-1 flex flex-col p-6 max-w-6xl mx-auto w-full">
        {/* Status + control bar */}
        <div className="grid grid-cols-12 gap-4 mb-4">
          <div className="col-span-8 p-5 rounded-lg border border-card-border bg-card/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSession}
                aria-label={running ? "End war-room session" : "Start war-room session"}
                className={`relative w-16 h-16 rounded-full flex items-center justify-center text-3xl transition-colors ${
                  running
                    ? "bg-danger/20 hover:bg-danger/30 text-danger"
                    : "bg-accent/20 hover:bg-accent/30 text-accent"
                }`}
              >
                {running ? "■" : "🎙"}
                {running && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-accent/30" />
                )}
              </button>
              <div>
                <div className="text-base font-semibold">
                  {running ? "Session active" : "Idle"}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {running
                    ? "Speak naturally. Three tools available: hive_query, vault_read_file, slack_send_message."
                    : "Press the mic to start. v1 launches the Mac voice loop; v2 will be browser-native."}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCommand((v) => !v)}
              className="text-xs font-mono px-3 py-1.5 border border-card-border rounded hover:bg-card-border/40"
            >
              {showCommand ? "hide" : "show"} launch cmd
            </button>
          </div>

          <div className="col-span-4 p-5 rounded-lg border border-card-border bg-card/50">
            <div className="text-xs uppercase tracking-wider text-muted mb-2">Cost</div>
            <div className="text-sm font-mono">~$0.50–$2 / 10 min</div>
            <div className="text-[11px] text-muted mt-1">
              Gemini 2.5 Flash native audio. Bills only while connected.
            </div>
          </div>
        </div>

        {showCommand && (
          <div className="mb-4 p-4 rounded-lg border border-accent/30 bg-accent/5">
            <div className="text-xs uppercase tracking-wider text-muted mb-2">Launch on your Mac</div>
            <pre className="text-xs font-mono bg-card border border-card-border rounded px-3 py-2 overflow-x-auto">
{`cd ${PROJECT_ROOT}\n${LAUNCH_CMD}`}
            </pre>
            <p className="text-[11px] text-muted mt-2">
              v1 runs on your Mac mic + speaker via the local Python script.
              v2 will move audio capture into this page so you can join from any
              browser — same Gemini Live brain, no Terminal needed.
            </p>
          </div>
        )}

        {/* Council in attendance */}
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">Council in attendance</div>
          <div className="grid grid-cols-7 gap-2">
            {ROLE_PRESENT.map((r) => (
              <div key={r.label} className="p-3 rounded border border-card-border bg-card/40 text-center">
                <div className="text-2xl">{r.emoji}</div>
                <div className="text-xs font-medium mt-1">{r.label}</div>
                <div className="text-[10px] text-muted mt-0.5">{r.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript */}
        <div className="flex-1 flex flex-col rounded-lg border border-card-border bg-card/30 overflow-hidden">
          <div className="px-4 py-2 border-b border-card-border bg-card/50 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Transcript</span>
            <span className="text-[11px] text-muted font-mono">
              {transcript.length} line{transcript.length === 1 ? "" : "s"}
            </span>
          </div>
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[40vh] font-mono text-sm">
            {transcript.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted text-sm">
                {running ? "Listening…" : "Press the mic to start."}
              </div>
            ) : (
              transcript.map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span
                    className={`shrink-0 w-20 text-[10px] uppercase tracking-wider mt-0.5 ${
                      line.who === "you"
                        ? "text-accent"
                        : line.who === "tool"
                        ? "text-amber-400"
                        : "text-foreground/60"
                    }`}
                  >
                    [{line.who}]
                  </span>
                  <span className="flex-1 text-foreground/90 whitespace-pre-wrap">{line.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted mt-3">
          Vault context for this channel:{" "}
          <code className="font-mono">01-Projects/War-Room/CONTEXT.md</code>. All
          tool calls during a session show up in <a href="/hive" className="text-accent hover:underline">/hive</a> with channel = <code className="font-mono">war-room</code>.
        </p>
      </main>
    </div>
  );
}
