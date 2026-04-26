/**
 * Per-role vault context injection.
 *
 * On every agent session start, the worker reads the role's declared
 * vault paths and prepends the contents to the system prompt. This is
 * the "auto-injection" pattern from the original command center video:
 * Comms knows about Steven's assistant config without being asked,
 * Research has its topic index pre-loaded, etc.
 *
 * Missing files (404 from GitHub) are skipped silently — the role
 * works fine without optional context. Total injection capped per
 * call to keep prompt bloat in check.
 */

const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";
const MAX_INJECTED_CHARS = 12_000; // ~3k tokens

/**
 * Per-role vault paths. Each path is best-effort — if it doesn't
 * exist yet, the role still works.
 */
const ROLE_VAULT_PATHS: Record<string, string[]> = {
  main: [], // no per-turn injection — Main's job is to delegate, not synthesize
  research: [
    "02-Areas/Research/INDEX.md",
    "02-Areas/Research/standing-questions.md",
  ],
  comms: [
    "02-Areas/Assistant/config.json",
    "02-Areas/Comms/voice.md",
    "02-Areas/Comms/vip-contacts.md",
  ],
  content: [
    "02-Areas/Content/voice.md",
    "02-Areas/Content/brand-style-guide.md",
  ],
  ops: [
    "02-Areas/Ops/SOP.md",
    "02-Areas/Ops/cadences.md",
    "02-Areas/Assistant/config.json",
  ],
  legal: [
    "02-Areas/Legal/INDEX.md",
    "02-Areas/Legal/entity-summary.md",
  ],
  dev: [
    "02-Areas/Engineering/conventions.md",
    "CLAUDE.md",
    "AGENTS.md",
  ],
};

interface VaultFetchResult {
  path: string;
  content: string;
}

async function fetchOne(path: string): Promise<VaultFetchResult | null> {
  const token = process.env.GITHUB_PAT;
  if (!token) return null;
  try {
    const res = await fetch(
      `${API}/repos/${VAULT_REPO}/contents/${encodeURI(path)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        cache: "no-store",
      }
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (!data.content) return null;
    const content = Buffer.from(
      data.content,
      (data.encoding ?? "base64") as BufferEncoding
    ).toString("utf-8");
    return { path, content };
  } catch {
    return null;
  }
}

/**
 * Build a "## Vault context (auto-injected)" block for the role.
 * Returns "" when no files are available — caller can safely
 * concatenate without conditionals.
 */
export async function loadVaultContextBlock(role: string): Promise<string> {
  const paths = ROLE_VAULT_PATHS[role] ?? [];
  if (paths.length === 0) return "";

  const results = await Promise.all(paths.map(fetchOne));
  const present = results.filter((r): r is VaultFetchResult => r !== null);
  if (present.length === 0) return "";

  const lines: string[] = [
    "",
    "---",
    "## Vault context (auto-injected at session start)",
    "",
    "These files from the swan-vault Obsidian repo are loaded into your context for this turn. Treat them as authoritative for preferences, voice, contacts, conventions, and anything else they define. If they conflict with general guidance above, they win.",
    "",
  ];

  let total = 0;
  for (const r of present) {
    const remaining = MAX_INJECTED_CHARS - total;
    if (remaining <= 200) break;
    const body =
      r.content.length > remaining
        ? r.content.slice(0, remaining) + "\n\n[truncated]"
        : r.content;
    lines.push(`### \`${r.path}\``);
    lines.push("");
    lines.push("```");
    lines.push(body);
    lines.push("```");
    lines.push("");
    total += body.length + r.path.length + 20;
  }

  return lines.join("\n");
}
