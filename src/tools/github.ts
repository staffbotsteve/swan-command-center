import { defineTool } from "./registry";
import { Octokit } from "@octokit/rest";

let _octokit: Octokit | null = null;
function octokit(): Octokit {
  if (_octokit) return _octokit;
  const token = process.env.GITHUB_PAT;
  if (!token) throw new Error("GITHUB_PAT not set");
  _octokit = new Octokit({ auth: token });
  return _octokit;
}

function parseRepo(repoArg: string | undefined): { owner: string; repo: string } {
  // Accept "owner/repo" or default to staffbotsteve/swan-command-center.
  const fallback = "staffbotsteve/swan-command-center";
  const value = repoArg ?? fallback;
  const [owner, repo] = value.split("/");
  if (!owner || !repo) throw new Error(`bad repo arg: ${value}`);
  return { owner, repo };
}

// ─── github.list_prs ────────────────────────────────────────────────────────

export interface GhListPrsInput {
  repo?: string;
  state?: "open" | "closed" | "all";
  limit?: number;
}
export interface GhPrSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  author: string;
  created_at: string;
  url: string;
  base: string;
  head: string;
}

export const listPrs = defineTool<GhListPrsInput, { prs: GhPrSummary[] }>({
  name: "github.list_prs",
  description: "List pull requests on a repo. Defaults to staffbotsteve/swan-command-center, state=open, limit=20.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/repo. Defaults to the command-center repo." },
      state: { type: "string", enum: ["open", "closed", "all"] },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  },
  async handler({ repo, state = "open", limit = 20 }) {
    const { owner, repo: r } = parseRepo(repo);
    const res = await octokit().pulls.list({ owner, repo: r, state, per_page: limit });
    return {
      prs: res.data.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state as "open" | "closed",
        draft: p.draft ?? false,
        author: p.user?.login ?? "unknown",
        created_at: p.created_at,
        url: p.html_url,
        base: p.base.ref,
        head: p.head.ref,
      })),
    };
  },
});

// ─── github.read_pr ─────────────────────────────────────────────────────────

export interface GhReadPrInput {
  repo?: string;
  number: number;
  include_diff?: boolean;
}
export interface GhPrDetail {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  draft: boolean;
  author: string;
  url: string;
  base: string;
  head: string;
  changed_files: number;
  additions: number;
  deletions: number;
  diff?: string;
}

export const readPr = defineTool<GhReadPrInput, GhPrDetail>({
  name: "github.read_pr",
  description: "Read a single PR: title, body, diff (optional), files changed.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      repo: { type: "string" },
      number: { type: "integer", minimum: 1 },
      include_diff: { type: "boolean", description: "If true, include the unified diff. Capped at 200k chars." },
    },
    required: ["number"],
    additionalProperties: false,
  },
  async handler({ repo, number, include_diff = false }) {
    const { owner, repo: r } = parseRepo(repo);
    const pr = (await octokit().pulls.get({ owner, repo: r, pull_number: number })).data;
    let diff: string | undefined;
    if (include_diff) {
      const diffRes = await octokit().request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
        owner,
        repo: r,
        pull_number: number,
        mediaType: { format: "diff" },
      });
      const raw = diffRes.data as unknown as string;
      diff = raw.length > 200_000 ? raw.slice(0, 200_000) + "\n[truncated]" : raw;
    }
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? "",
      state: pr.state as "open" | "closed",
      draft: pr.draft ?? false,
      author: pr.user?.login ?? "unknown",
      url: pr.html_url,
      base: pr.base.ref,
      head: pr.head.ref,
      changed_files: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      diff,
    };
  },
});

// ─── github.comment ─────────────────────────────────────────────────────────

export interface GhCommentInput {
  repo?: string;
  number: number;
  body: string;
}
export interface GhCommentOutput {
  comment_id: number;
  url: string;
}

export const commentTool = defineTool<GhCommentInput, GhCommentOutput>({
  name: "github.comment",
  description:
    "Post a top-level comment on a PR. Use github.review_comment for line-level review comments (not yet wired).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      repo: { type: "string" },
      number: { type: "integer", minimum: 1 },
      body: { type: "string", description: "Markdown body." },
    },
    required: ["number", "body"],
    additionalProperties: false,
  },
  async handler({ repo, number, body }) {
    const { owner, repo: r } = parseRepo(repo);
    const res = await octokit().issues.createComment({
      owner,
      repo: r,
      issue_number: number,
      body,
    });
    return { comment_id: res.data.id, url: res.data.html_url };
  },
});

// Default export = list_prs (so worker/tools.ts can import a single thing).
// Other tools accessed via named exports.
export default listPrs;
