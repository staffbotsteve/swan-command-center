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

/**
 * Create or update a single file in the vault via the GitHub Contents API.
 * Idempotent: fetches the existing SHA first so overwrites don't 422.
 */
export async function writeVaultFile(path: string, content: string, message: string): Promise<string> {
  let sha: string | undefined;
  const head = await fetch(`${API}/repos/${VAULT_REPO}/contents/${encodeURI(path)}`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
  if (head.ok) sha = (await head.json()).sha;
  else if (head.status !== 404) {
    throw new Error(`vault pre-read ${path}: ${head.status}`);
  }

  const res = await fetch(`${API}/repos/${VAULT_REPO}/contents/${encodeURI(path)}`, {
    method: "PUT",
    headers: ghHeaders(),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`vault write ${path}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.content?.sha ?? "";
}
