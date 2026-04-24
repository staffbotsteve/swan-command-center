import { defineTool } from "./registry";
import type { VaultListDirInput, VaultListDirOutput } from "@/types/tools";

const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

interface GhEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export default defineTool<VaultListDirInput, VaultListDirOutput>({
  name: "vault.list_dir",
  description:
    "List entries at a directory path in the swan-vault repo. Returns name, path, and type.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Repo-relative directory. Use '' or '/' for repo root.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async handler({ path }) {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    const url =
      normalized === ""
        ? `${API}/repos/${VAULT_REPO}/contents`
        : `${API}/repos/${VAULT_REPO}/contents/${encodeURI(normalized)}`;
    const res = await fetch(url, { headers: ghHeaders(), cache: "no-store" });
    if (!res.ok) {
      throw new Error(`vault.list_dir ${path}: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error(`${path} is a file, not a directory. Use vault.read_file.`);
    }
    const entries = (data as GhEntry[]).map((e) => ({
      name: e.name,
      path: e.path,
      type: e.type,
    }));
    return { entries };
  },
});
