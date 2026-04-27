import { defineTool } from "./registry";

const BASE = process.env.NOTEBOOKLM_COMPANION_URL;
const SECRET = process.env.NOTEBOOKLM_COMPANION_SECRET;

function authHeaders() {
  if (!BASE) throw new Error("NOTEBOOKLM_COMPANION_URL not set");
  if (!SECRET) throw new Error("NOTEBOOKLM_COMPANION_SECRET not set");
  return {
    Authorization: `Bearer ${SECRET}`,
    "content-type": "application/json",
  };
}

async function call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`notebooklm ${path}: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ─── notebooklm.list_notebooks ──────────────────────────────────────────────

export const listNotebooks = defineTool<Record<string, never>, unknown>({
  name: "notebooklm.list_notebooks",
  description: "List all NotebookLM notebooks for the signed-in account. Returns the raw payload — each notebook entry contains its title, source ids, and metadata. Call this first when the user mentions a topic and you don't yet know which notebook to query.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  async handler() {
    return call("/notebooks");
  },
});

// ─── notebooklm.create_notebook ─────────────────────────────────────────────

export interface CreateNotebookInput {
  title: string;
}

export const createNotebook = defineTool<CreateNotebookInput, unknown>({
  name: "notebooklm.create_notebook",
  description: "Create a new NotebookLM notebook with the given title. Returns the raw payload including the new notebook id.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
    additionalProperties: false,
  },
  async handler({ title }) {
    return call("/notebooks", { method: "POST", body: JSON.stringify({ title }) });
  },
});

// ─── notebooklm.add_source ──────────────────────────────────────────────────

export interface AddSourceInput {
  notebook_id: string;
  url: string;
}

export const addSource = defineTool<AddSourceInput, unknown>({
  name: "notebooklm.add_source",
  description: "Add a URL as a source to a NotebookLM notebook. YouTube URLs work reliably; web URLs may need different handling depending on NotebookLM's content type detection.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: { type: "string" },
      url: { type: "string" },
    },
    required: ["notebook_id", "url"],
    additionalProperties: false,
  },
  async handler(input) {
    return call("/sources", { method: "POST", body: JSON.stringify(input) });
  },
});

// ─── notebooklm.query (low-level) ───────────────────────────────────────────

export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface QueryInput {
  notebook_id: string;
  source_ids: string[];
  question: string;
  history?: ChatHistoryEntry[];
  chat_session_id?: string;
}

export interface QueryResult {
  chat_session_id: string;
  turn_index: number;
  answer: string | null;
  raw_envelopes: unknown[];
}

export const queryNotebook = defineTool<QueryInput, QueryResult>({
  name: "notebooklm.query",
  description: "Low-level chat against a NotebookLM notebook. Requires explicit source_ids. Returns raw_envelopes plus the extracted answer string. Most callers should prefer notebooklm.research instead.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: { type: "string" },
      source_ids: { type: "array", items: { type: "string" } },
      question: { type: "string" },
      history: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
          },
          required: ["role", "content"],
          additionalProperties: false,
        },
      },
      chat_session_id: { type: "string" },
    },
    required: ["notebook_id", "source_ids", "question"],
    additionalProperties: false,
  },
  async handler(input) {
    return call<QueryResult>("/query", { method: "POST", body: JSON.stringify(input) });
  },
});

// ─── notebooklm.research (high-level) ───────────────────────────────────────
//
// The Research agent's primary entry point. Same wire shape as `query` but
// returns just the clean answer text (no raw envelopes), trims it for the
// agent's context window, and is described in research-task language.

export interface ResearchInput {
  notebook_id: string;
  source_ids: string[];
  question: string;
  history?: ChatHistoryEntry[];
  chat_session_id?: string;
}

export interface ResearchResult {
  answer: string;
  citations_present: boolean;
  chat_session_id: string;
  turn_index: number;
}

export const research = defineTool<ResearchInput, ResearchResult>({
  name: "notebooklm.research",
  description:
    "Ask a research question grounded in a NotebookLM notebook's sources. Returns the assistant's clean answer with inline citation markers like [1-3]. This is the preferred research tool when the user wants an answer based on their existing NotebookLM notebooks (videos, articles, PDFs they've already collected). Workflow: (1) call notebooklm.list_notebooks to find the right notebook id and source ids if you don't already know them, (2) call this with notebook_id + source_ids + question. Pass the returned chat_session_id back in subsequent calls to maintain conversation context.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: {
        type: "string",
        description: "UUID of the NotebookLM notebook to query.",
      },
      source_ids: {
        type: "array",
        items: { type: "string" },
        description:
          "UUIDs of the sources within the notebook to ground the answer in. Pass all available source ids unless the user explicitly scoped the question to a subset.",
      },
      question: {
        type: "string",
        description: "The research question to ask.",
      },
      history: {
        type: "array",
        description:
          "Prior conversation turns in chronological order. Required for follow-up questions to maintain context.",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
          },
          required: ["role", "content"],
          additionalProperties: false,
        },
      },
      chat_session_id: {
        type: "string",
        description:
          "Optional: pass a chat_session_id from a previous call to continue that conversation thread.",
      },
    },
    required: ["notebook_id", "source_ids", "question"],
    additionalProperties: false,
  },
  async handler(input) {
    const result = await call<QueryResult>("/query", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const answer = result.answer ?? "";
    return {
      answer,
      citations_present: /\[\d+(?:[-,\s]+\d+)*\]/.test(answer),
      chat_session_id: result.chat_session_id,
      turn_index: result.turn_index,
    };
  },
});

// ─── notebooklm.generate_report ─────────────────────────────────────────────

export interface GenerateReportInput {
  notebook_id: string;
  source_ids: string[];
  style?: string;
}

export const generateReport = defineTool<GenerateReportInput, unknown>({
  name: "notebooklm.generate_report",
  description:
    "Kick off generation of a Studio artifact for the given sources. style 'interactive_mindmap' is confirmed working; 'briefing_doc', 'study_guide', 'faq', 'timeline', 'audio_overview' are extrapolated and may need adjustment. Returns the kickoff response — generation is asynchronous on NotebookLM's side; the result appears in the notebook's Studio panel.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: { type: "string" },
      source_ids: { type: "array", items: { type: "string" } },
      style: { type: "string" },
    },
    required: ["notebook_id", "source_ids"],
    additionalProperties: false,
  },
  async handler(input) {
    return call("/reports", { method: "POST", body: JSON.stringify(input) });
  },
});

export default listNotebooks;
