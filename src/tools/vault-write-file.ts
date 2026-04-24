import { defineTool } from "./registry";
import type { VaultWriteFileInput, VaultWriteFileOutput } from "@/types/tools";

const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "content-type": "application/json",
  };
}

export default defineTool<VaultWriteFileInput, VaultWriteFileOutput>({
  name: "vault.write_file",
  description:
    "Create or update a file in swan-vault. Uses the GitHub Contents API with a SHA check — overwrites only if the current file matches the SHA we read. For new files, pass no sha and it creates.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Repo-relative path." },
      content: { type: "string", description: "Full file body (utf-8)." },
      commit_message: { type: "string", description: "Defaults to 'agent write: <path>'." },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  async handler({ path, content, commit_message }) {
    // Fetch existing sha if present (idempotent create-or-update).
    let sha: string | undefined;
    const head = await fetch(
      `${API}/repos/${VAULT_REPO}/contents/${encodeURI(path)}`,
      { headers: ghHeaders(), cache: "no-store" }
    );
    if (head.ok) {
      const existing = await head.json();
      sha = existing.sha;
    } else if (head.status !== 404) {
      throw new Error(`vault pre-read ${path}: ${head.status}`);
    }

    const res = await fetch(
      `${API}/repos/${VAULT_REPO}/contents/${encodeURI(path)}`,
      {
        method: "PUT",
        headers: ghHeaders(),
        body: JSON.stringify({
          message: commit_message ?? `agent write: ${path}`,
          content: Buffer.from(content, "utf-8").toString("base64"),
          ...(sha ? { sha } : {}),
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`vault.write_file ${path}: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return { path, sha: data.content?.sha ?? "" };
  },
});
