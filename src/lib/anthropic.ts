const API_BASE = "https://api.anthropic.com/v1";
const BETA_HEADER = "agent-api-2026-03-01";

function headers() {
  return {
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": BETA_HEADER,
    "content-type": "application/json",
  };
}

export interface Agent {
  id: string;
  name: string;
  model: string;
  system?: string;
  created_at?: string;
}

export interface Session {
  id: string;
  agent: { id: string } | string;
  status: string;
  created_at: string;
}

export interface SessionEvent {
  id: string;
  type: string;
  content?: { type: "text"; text: string }[];
  error?: { message: string; type: string };
  processed_at?: string;
  start_event_id?: string;
  is_error?: boolean;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

// ─── Agents ────────────────────────────────────────────────────────────────

export async function listAgents(): Promise<Agent[]> {
  const all: Agent[] = [];
  let url = `${API_BASE}/agents?limit=100`;
  while (url) {
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`listAgents: ${res.status} ${await res.text()}`);
    const data = await res.json();
    all.push(...(data.data ?? data.agents ?? []));
    url =
      data.has_more && data.next_page
        ? `${API_BASE}/agents?limit=100&after=${data.next_page}`
        : "";
  }
  return all;
}

export async function getAgent(agentId: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents/${agentId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`getAgent: ${res.status}`);
  return res.json();
}

export async function createAgent(params: {
  name: string;
  model: string;
  system?: string;
}): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`createAgent: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function archiveAgent(agentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${agentId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`archiveAgent: ${res.status} ${await res.text()}`);
  }
}

// ─── Sessions ──────────────────────────────────────────────────────────────

export async function createSession(
  agentId: string,
  environmentId: string
): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      agent: { type: "agent_reference", id: agentId },
      environment: environmentId,
    }),
  });
  if (!res.ok) {
    throw new Error(`createSession: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getSession(sessionId: string): Promise<Session & { status: string }> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`getSession: ${res.status}`);
  return res.json();
}

// ─── Events ────────────────────────────────────────────────────────────────

/** Append one or more events to a session. Does not wait for the agent to respond. */
export async function postEvents(
  sessionId: string,
  events: { type: string; content?: unknown }[]
): Promise<SessionEvent[]> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    throw new Error(`postEvents: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.data ?? [];
}

export async function listEvents(sessionId: string): Promise<SessionEvent[]> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`listEvents: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.data ?? [];
}

// ─── High-level helpers ────────────────────────────────────────────────────

/** Convenience: append a user text message as a single event. */
export async function sendUserMessage(sessionId: string, text: string): Promise<void> {
  await postEvents(sessionId, [
    { type: "user", content: [{ type: "text", text }] },
  ]);
}

export interface RunTurnResult {
  text: string;
  events: SessionEvent[];
  error?: string;
}

/**
 * Drive a single user→agent turn to completion.
 *
 * Posts the user message, then polls `/events` until the session reaches
 * `status_idle` or an `error` event lands. Returns the concatenated text
 * from the last `agent` event.
 *
 * This replaces the older streamSession/collectText pair, which was written
 * for an earlier shape of the beta API (type `agent.message`, SSE via GET
 * /stream) that no longer matches reality.
 */
export async function runTurn(
  agentId: string,
  environmentId: string,
  text: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<RunTurnResult & { session_id: string }> {
  const pollInterval = opts.pollIntervalMs ?? 1500;
  const timeout = opts.timeoutMs ?? 90_000;

  const session = await createSession(agentId, environmentId);
  await sendUserMessage(session.id, text);

  const deadline = Date.now() + timeout;
  let events: SessionEvent[] = [];
  let sawRunningAfterUser = false;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    events = await listEvents(session.id);

    // We're done when we see an error, or we saw running-after-user and then idle.
    const lastIdx = events.findIndex((e) => e.type === "user");
    const afterUser = lastIdx >= 0 ? events.slice(lastIdx + 1) : events;
    if (afterUser.some((e) => e.type === "status_running")) sawRunningAfterUser = true;
    const latestError = afterUser.find((e) => e.type === "error");
    if (latestError) {
      return {
        session_id: session.id,
        events,
        text: "",
        error: latestError.error?.message ?? "unknown error",
      };
    }
    if (sawRunningAfterUser && afterUser[afterUser.length - 1]?.type === "status_idle") break;
  }

  const agentEvents = events.filter((e) => e.type === "agent");
  const lastAgent = agentEvents[agentEvents.length - 1];
  const textOut =
    (lastAgent?.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("") ?? "";

  return { session_id: session.id, events, text: textOut };
}
