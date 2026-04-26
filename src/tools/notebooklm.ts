import { defineTool } from "./registry";

const BASE = process.env.NOTEBOOKLM_SERVICE_URL;
const SECRET = process.env.NOTEBOOKLM_SHARED_SECRET;

function authHeaders() {
  if (!BASE) throw new Error("NOTEBOOKLM_SERVICE_URL not set");
  if (!SECRET) throw new Error("NOTEBOOKLM_SHARED_SECRET not set");
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
  description: "List your NotebookLM notebooks (id, title, source count, updated_at).",
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
  description: "Create a new NotebookLM notebook with the given title.",
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
  description: "Add a URL as a source to a NotebookLM notebook.",
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

// ─── notebooklm.query ───────────────────────────────────────────────────────

export interface QueryInput {
  notebook_id: string;
  question: string;
}

export const queryNotebook = defineTool<QueryInput, unknown>({
  name: "notebooklm.query",
  description:
    "Ask a question against a NotebookLM notebook's sources. Returns the answer and citations.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: { type: "string" },
      question: { type: "string" },
    },
    required: ["notebook_id", "question"],
    additionalProperties: false,
  },
  async handler(input) {
    return call("/query", { method: "POST", body: JSON.stringify(input) });
  },
});

// ─── notebooklm.generate_report ─────────────────────────────────────────────

export interface GenerateReportInput {
  notebook_id: string;
  style?: "briefing" | "deep_dive" | "slide_deck";
}

export const generateReport = defineTool<GenerateReportInput, unknown>({
  name: "notebooklm.generate_report",
  description:
    "Generate a structured report from a NotebookLM notebook. Style: briefing (default), deep_dive, slide_deck.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: { type: "string" },
      style: { type: "string", enum: ["briefing", "deep_dive", "slide_deck"] },
    },
    required: ["notebook_id"],
    additionalProperties: false,
  },
  async handler(input) {
    return call("/reports", { method: "POST", body: JSON.stringify(input) });
  },
});

export default listNotebooks;
