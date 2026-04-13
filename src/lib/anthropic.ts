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
  agent: { id: string };
  status: string;
  created_at: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export async function listAgents(): Promise<Agent[]> {
  const allAgents: Agent[] = [];
  let url = `${API_BASE}/agents?limit=100`;

  while (url) {
    const res = await fetch(url, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list agents: ${res.status} ${err}`);
    }
    const data = await res.json();
    allAgents.push(...(data.data ?? data.agents ?? []));

    if (data.has_more && data.next_page) {
      url = `${API_BASE}/agents?limit=100&after=${data.next_page}`;
    } else {
      url = "";
    }
  }

  return allAgents;
}

export async function getAgent(agentId: string): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents/${agentId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to get agent: ${res.status}`);
  return res.json();
}

export async function createSession(
  agentId: string,
  environmentId: string
): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      agent: agentId,
      environment_id: environmentId,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create session: ${res.status} ${err}`);
  }
  return res.json();
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: message }],
        },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to send message: ${res.status} ${err}`);
  }
  return res.body!;
}

export async function streamSession(
  sessionId: string
): Promise<Response> {
  return fetch(`${API_BASE}/sessions/${sessionId}/stream`, {
    headers: {
      ...headers(),
      Accept: "text/event-stream",
    },
  });
}

export async function getSession(sessionId: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
  return res.json();
}
