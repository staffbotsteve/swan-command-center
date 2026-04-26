import { defineTool } from "./registry";

const API = "https://slack.com/api";

async function slackPost<T = unknown>(method: string, body: unknown): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`slack ${method}: ${data.error ?? "unknown"} ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data as T;
}

async function slackGet<T = unknown>(method: string, params: Record<string, string | number> = {}): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  const url = new URL(`${API}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`slack ${method}: ${data.error ?? "unknown"}`);
  }
  return data as T;
}

// ─── slack.send_message ─────────────────────────────────────────────────────

export interface SlackSendInput {
  channel: string;
  text: string;
  thread_ts?: string;
}

export const sendMessage = defineTool<SlackSendInput, unknown>({
  name: "slack.send_message",
  description:
    "Post a message to a Slack channel. `channel` accepts channel id (C0123...) or name with leading # (e.g. #assistant-calendar). `thread_ts` to reply in a thread.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      channel: { type: "string" },
      text: { type: "string" },
      thread_ts: { type: "string" },
    },
    required: ["channel", "text"],
    additionalProperties: false,
  },
  async handler({ channel, text, thread_ts }) {
    const body: Record<string, unknown> = { channel, text };
    if (thread_ts) body.thread_ts = thread_ts;
    return slackPost("chat.postMessage", body);
  },
});

// ─── slack.list_channels ────────────────────────────────────────────────────

export interface SlackListChannelsInput {
  exclude_archived?: boolean;
  limit?: number;
  types?: string;
}

export const listChannels = defineTool<SlackListChannelsInput, unknown>({
  name: "slack.list_channels",
  description:
    "List Slack channels in the workspace. Returns id, name, is_member, topic, purpose. Use to discover the right channel id for slack.send_message.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      exclude_archived: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
      types: {
        type: "string",
        description: "Comma-separated: public_channel, private_channel, im, mpim. Default public_channel.",
      },
    },
    additionalProperties: false,
  },
  async handler({ exclude_archived = true, limit = 200, types = "public_channel" }) {
    return slackGet("conversations.list", {
      exclude_archived: String(exclude_archived),
      limit,
      types,
    });
  },
});

// ─── slack.search_messages ──────────────────────────────────────────────────

export interface SlackSearchInput {
  query: string;
  count?: number;
}

export const searchMessages = defineTool<SlackSearchInput, unknown>({
  name: "slack.search_messages",
  description:
    "Search Slack messages with Slack search syntax (e.g. `from:@steven in:#assistant-calendar after:2026-04-01`). Requires search:read scope.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      count: { type: "integer", minimum: 1, maximum: 100 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async handler({ query, count = 20 }) {
    return slackGet("search.messages", { query, count });
  },
});

export default sendMessage;
