// NotebookLM tools — thin wrappers around the notebooklm-py CLI.
//
// Architecture: notebooklm-py runs locally as a Python venv on the worker
// machine. Auth is established once via `notebooklm login` (browser popup
// → Google OAuth → session persisted at ~/.notebooklm/storage_state.json).
// Each tool here shells out to the CLI, asks for --json output, and
// returns the parsed result. No HTTP companion, no Fly deploy.
//
// CLI: https://github.com/teng-lin/notebooklm-py

import { spawn } from "node:child_process";
import { defineTool } from "./registry";

const CLI =
  process.env.NOTEBOOKLM_CLI ??
  "/Users/stevenswan/project-folders/swan-command-center/app/companion/notebooklm/.venv/bin/notebooklm";

async function runCli(args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(CLI, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`notebooklm CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `notebooklm CLI exit ${code}: ${(stderr || stdout).slice(0, 400)}`
          )
        );
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

interface NotebookSummary {
  index: number;
  id: string;
  title: string;
  is_owner: boolean;
  created_at: string;
}

interface ListResult {
  notebooks: NotebookSummary[];
  count: number;
}

// ─── notebooklm.list_notebooks ──────────────────────────────────────────────

export const listNotebooks = defineTool<Record<string, never>, ListResult>({
  name: "notebooklm.list_notebooks",
  description:
    "List every NotebookLM notebook in the signed-in account (auto-discovered, no manual registration). Returns each notebook's id, title, owner status, and creation date. Always call this first when the user references a notebook by name to find the right id.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  async handler() {
    const out = await runCli(["list", "--json"]);
    return JSON.parse(out) as ListResult;
  },
});

// ─── notebooklm.search ──────────────────────────────────────────────────────

export interface SearchInput {
  query: string;
}

export interface SearchResult {
  matches: NotebookSummary[];
  total_searched: number;
}

export const searchNotebooks = defineTool<SearchInput, SearchResult>({
  name: "notebooklm.search",
  description:
    "Find NotebookLM notebooks by case-insensitive title substring match. Use this when the user references a notebook by name (e.g. 'my Bracket Guide notebook') to locate the matching id. Returns all matches; if multiple, ask the user to disambiguate.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  async handler({ query }) {
    const out = await runCli(["list", "--json"]);
    const data = JSON.parse(out) as ListResult;
    const q = query.toLowerCase();
    const matches = data.notebooks.filter((nb) =>
      nb.title.toLowerCase().includes(q)
    );
    return { matches, total_searched: data.count };
  },
});

// ─── notebooklm.ask ─────────────────────────────────────────────────────────

export interface AskInput {
  notebook_id: string;
  question: string;
  // Optional — pass to continue an existing conversation. Otherwise a
  // fresh conversation is started automatically.
  conversation_id?: string;
  // Optional — limit grounding to specific source ids within the notebook.
  source_ids?: string[];
}

export const ask = defineTool<AskInput, unknown>({
  name: "notebooklm.ask",
  description:
    "Ask a question grounded in a NotebookLM notebook's sources. Returns the answer with inline [1][2] citation markers and source references. Use the conversation_id from a previous answer to continue that thread; otherwise a new conversation starts automatically.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      notebook_id: {
        type: "string",
        description: "UUID of the notebook (from list_notebooks/search).",
      },
      question: { type: "string" },
      conversation_id: {
        type: "string",
        description:
          "Optional: continue a prior conversation by passing the id returned in a previous answer.",
      },
      source_ids: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional: restrict grounding to specific sources within the notebook.",
      },
    },
    required: ["notebook_id", "question"],
    additionalProperties: false,
  },
  async handler({ notebook_id, question, conversation_id, source_ids }) {
    const args = ["ask", "-n", notebook_id, "--json"];
    if (conversation_id) args.push("-c", conversation_id);
    for (const sid of source_ids ?? []) args.push("-s", sid);
    args.push(question);
    const out = await runCli(args, 180_000);
    return JSON.parse(out);
  },
});

export default listNotebooks;
