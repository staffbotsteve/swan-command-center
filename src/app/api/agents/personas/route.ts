import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

interface Persona {
  role: string;
  title: string;
  model: string;
  department: string;
  personality: string;
}

/**
 * Read each agent's prompt markdown and extract: title, model,
 * department, and the body of the `## Personality` block. Returns
 * one entry per role for the dashboard's persona view.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const agentsDir = path.join(process.cwd(), "src", "agents");
  const files = await fs.readdir(agentsDir);
  const personas: Persona[] = [];

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const role = file.replace(/\.md$/, "");
    const raw = await fs.readFile(path.join(agentsDir, file), "utf-8");
    const titleMatch = raw.match(/^# (.+?)$/m);
    const modelMatch = raw.match(/\*\*Model:\*\* +(.+?)$/m);
    const deptMatch = raw.match(/\*\*Department:\*\* +(.+?)$/m);

    // Extract the body between "## Personality" and the next "## " heading.
    const persSection = raw.match(/## Personality\s*\n([\s\S]+?)(?=\n## |\n# |$)/);
    const personality = persSection ? persSection[1].trim() : "";

    personas.push({
      role,
      title: titleMatch?.[1] ?? role,
      model: modelMatch?.[1]?.trim() ?? "",
      department: deptMatch?.[1]?.trim() ?? "",
      personality,
    });
  }

  // Stable order: Main first, then alphabetical.
  personas.sort((a, b) => {
    if (a.role === "main") return -1;
    if (b.role === "main") return 1;
    return a.role.localeCompare(b.role);
  });

  return NextResponse.json({ personas });
}
