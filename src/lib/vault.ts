const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: "application/vnd.github+json",
  };
}

export interface VaultFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string;
}

export interface VaultProject {
  name: string;
  path: string;
  context?: string;
}

export interface VaultCompany {
  name: string;
  path: string;
  context?: string;
  projects: VaultProject[];
}

export interface VaultSession {
  name: string;
  path: string;
  content?: string;
  date?: string;
  source?: string;
}

async function listDir(path: string): Promise<VaultFile[]> {
  const res = await fetch(
    `${API}/repos/${VAULT_REPO}/contents/${path}`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Vault read failed: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function readFile(path: string): Promise<string> {
  const res = await fetch(
    `${API}/repos/${VAULT_REPO}/contents/${path}`,
    { headers: headers(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`File read failed: ${res.status}`);
  const data = await res.json();
  return Buffer.from(data.content, "base64").toString("utf-8");
}

export async function listCompanies(): Promise<VaultCompany[]> {
  const dirs = await listDir("01-Projects");
  const companies: VaultCompany[] = [];

  for (const dir of dirs) {
    if (dir.name.startsWith(".") || dir.name.startsWith("{")) continue;

    // Read company-level CONTEXT.md
    let context: string | undefined;
    try {
      context = await readFile(`01-Projects/${dir.name}/CONTEXT.md`);
    } catch {
      // no context file
    }

    // Discover project sub-folders
    const subDirs = await listDir(`01-Projects/${dir.name}`);
    const projects: VaultProject[] = [];

    for (const sub of subDirs) {
      if (sub.name === "CONTEXT.md" || sub.name.startsWith(".")) continue;
      // It's a project sub-folder
      let projContext: string | undefined;
      try {
        projContext = await readFile(
          `01-Projects/${dir.name}/${sub.name}/CONTEXT.md`
        );
      } catch {
        // no context file
      }
      projects.push({
        name: sub.name,
        path: sub.path,
        context: projContext,
      });
    }

    companies.push({
      name: dir.name,
      path: dir.path,
      context,
      projects,
    });
  }

  return companies;
}

export async function listSessions(
  source?: "Code" | "Cowork" | "Managed-Agents"
): Promise<VaultSession[]> {
  const sources = source
    ? [source]
    : ["Code", "Cowork", "Managed-Agents"];

  const allSessions: VaultSession[] = [];
  for (const src of sources) {
    const files = await listDir(`03-Sessions/${src}`);
    for (const f of files) {
      if (!f.name.endsWith(".md")) continue;
      const dateMatch = f.name.match(/^(\d{4}-\d{2}-\d{2})/);
      allSessions.push({
        name: f.name.replace(".md", ""),
        path: f.path,
        date: dateMatch?.[1],
        source: src,
      });
    }
  }

  return allSessions.sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "")
  );
}

export async function getSessionContent(
  path: string
): Promise<string> {
  return readFile(path);
}
