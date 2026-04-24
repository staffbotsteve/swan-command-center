import { defineTool } from "./registry";
import type { VaultReadFileInput, VaultReadFileOutput } from "@/types/tools";

const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export default defineTool<VaultReadFileInput, VaultReadFileOutput>({
  name: "vault.read_file",
  description:
    "Read a single file from the swan-vault Obsidian repo. Path is repo-relative (e.g., '02-Areas/Research/ai-agents.md').",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Repo-relative path. Use forward slashes.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async handler({ path }) {
    const res = await fetch(
      `${API}/repos/${VAULT_REPO}/contents/${encodeURI(path)}`,
      { headers: ghHeaders(), cache: "no-store" }
    );
    if (!res.ok) {
      throw new Error(`vault.read_file ${path}: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      throw new Error(`${path} is a directory, not a file. Use vault.list_dir.`);
    }
    const content = Buffer.from(data.content ?? "", data.encoding ?? "base64").toString("utf-8");
    return { path, content, sha: data.sha };
  },
});
