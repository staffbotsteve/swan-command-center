import { defineTool } from "./registry";
import { getPrimaryGoogleAccessToken } from "@/lib/google-tokens";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPrimaryGoogleAccessToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`gmail ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ─── gmail.list_threads ─────────────────────────────────────────────────────

export interface GmailListThreadsInput {
  query?: string;
  max_results?: number;
  label_ids?: string[];
}

export const listThreads = defineTool<GmailListThreadsInput, unknown>({
  name: "gmail.list_threads",
  description:
    'List Gmail threads. Optional: query (Gmail search syntax e.g. "is:unread from:foo@bar.com"), max_results (1-50, default 20), label_ids (e.g. INBOX, STARRED).',
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer", minimum: 1, maximum: 50 },
      label_ids: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  },
  async handler({ query, max_results = 20, label_ids = [] }) {
    const params = new URLSearchParams({ maxResults: String(max_results) });
    if (query) params.set("q", query);
    for (const id of label_ids) params.append("labelIds", id);
    return gmailFetch(`/threads?${params.toString()}`);
  },
});

// ─── gmail.read_thread ──────────────────────────────────────────────────────

export interface GmailReadThreadInput {
  thread_id: string;
}

export const readThread = defineTool<GmailReadThreadInput, unknown>({
  name: "gmail.read_thread",
  description: "Read all messages in a Gmail thread. Returns full message bodies.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      thread_id: { type: "string" },
    },
    required: ["thread_id"],
    additionalProperties: false,
  },
  async handler({ thread_id }) {
    return gmailFetch(`/threads/${encodeURIComponent(thread_id)}?format=full`);
  },
});

// ─── gmail.create_draft ─────────────────────────────────────────────────────

export interface GmailCreateDraftInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  thread_id?: string;
}

function rfc822(input: GmailCreateDraftInput): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
  ];
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  if (input.bcc) lines.push(`Bcc: ${input.bcc}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("");
  lines.push(input.body);
  return lines.join("\r\n");
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const createDraft = defineTool<GmailCreateDraftInput, unknown>({
  name: "gmail.create_draft",
  description:
    "Create a Gmail draft (does NOT send). Returns the draft id and message id. Optional: cc, bcc, thread_id (to draft a reply).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string", description: "Plain text body." },
      cc: { type: "string" },
      bcc: { type: "string" },
      thread_id: { type: "string" },
    },
    required: ["to", "subject", "body"],
    additionalProperties: false,
  },
  async handler(input) {
    const raw = base64UrlEncode(rfc822(input));
    const body: Record<string, unknown> = { message: { raw } };
    if (input.thread_id) {
      (body.message as Record<string, unknown>).threadId = input.thread_id;
    }
    return gmailFetch("/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  },
});

// ─── gmail.send ─────────────────────────────────────────────────────────────

export interface GmailSendInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  thread_id?: string;
}

export const send = defineTool<GmailSendInput, unknown>({
  name: "gmail.send",
  description:
    "Send a Gmail message immediately. Use create_draft for drafts that need review.",
  source: "builtin",
  initial_status: "experimental", // Steven's policy: drafts > sends. Surfaced in registry.
  input_schema: {
    type: "object",
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
      cc: { type: "string" },
      bcc: { type: "string" },
      thread_id: { type: "string" },
    },
    required: ["to", "subject", "body"],
    additionalProperties: false,
  },
  async handler(input) {
    const raw = base64UrlEncode(rfc822(input));
    const body: Record<string, unknown> = { raw };
    if (input.thread_id) body.threadId = input.thread_id;
    return gmailFetch("/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  },
});

export default listThreads;
