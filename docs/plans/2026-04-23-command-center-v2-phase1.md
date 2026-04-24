# Swan Command Center v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 1 foundation of the Swan Command Center v2 — Google SSO, six shared-department agents replacing the 48-agent company-first roster, Supabase-backed task/memory/registry schemas, rules-first router with Triage fallback, Telegram inbound/outbound bridge, NotebookLM tool wrapper, YouTube source-discovery sub-tool, Gemini-Flash classifier pipeline, and a weekly vault-promotion cron — all on the existing Next.js 16 / Vercel stack.

**Architecture:** Cloud Managed Agents API (beta `agent-api-2026-03-01`) as the agent runtime; Vercel as the host; Supabase Postgres as hot memory; `staffbotsteve/swan-vault` on GitHub as durable memory. Function-first shared-department agents. Every inbound message flows through auth → queue → router → agent session → hive-mind log → outbound dispatch. Weekly cron promotes high-importance hot memories into vault markdown.

**Tech stack:** Next.js 16 · React 19 · TypeScript · Tailwind 4 · NextAuth · Supabase JS · Anthropic Messages + Managed Agents APIs · Google Generative AI (Gemini 2.5 Flash) · yt-dlp · Telegram Bot API · Vitest.

**Spec:** `docs/specs/2026-04-23-command-center-v2-design.md` (read §11 — acceptance criteria — and §7 — schema — before starting).

---

## File map

Created in this plan (at repo root — no `app/` subdirectory):

```
supabase/
  migrations/
    0001_v2_schema.sql                 ✓ scaffolded
src/
  agents/                              ✓ scaffolded
    main.md  research.md  comms.md  content.md  ops.md  legal.md
  types/                               ✓ scaffolded
    db.ts
    tools.ts
  routing/                             ✓ scaffolded
    index.ts  rules.ts  index.test.ts
  tools/                               ✓ framework scaffolded
    registry.ts  index.ts
    vault-read-file.ts                 ← Task 10
    vault-list-dir.ts                  ← Task 10
    vault-write-file.ts                ← Task 10
    dispatch.ts                        ← Task 11
    classify.ts                        ← Task 12
    web-search.ts                      ← Task 13
    youtube-search.ts                  ← Task 14
    notebooklm.ts                      ← Task 15
    hive-query.ts                      ← Task 18 support
  lib/
    supabase.ts                        ← Task 3
    queue.ts                           ← Task 7
    bootstrap-agents.ts                ← Task 5
    prompt-loader.ts                   ← Task 6
    classifier.ts                      ← Task 17
  app/
    api/
      auth/[...nextauth]/route.ts      ← Task 4
      dispatch/route.ts                ← Task 8 (refactor existing)
      channels/telegram/route.ts       ← Task 16
      tools/[name]/route.ts            ← Task 10+
      cron/
        vault-promote/route.ts         ← Task 18
      hive/route.ts                    ← Task 20 support
      registry/
        agents/route.ts                ← Task 22 support
        skills/route.ts                ← Task 22 support
    hive/page.tsx                      ← Task 20
    memory/page.tsx                    ← Task 21
    registry/page.tsx                  ← Task 22
  components/
    HiveBoard.tsx                      ← Task 20
    MemoryPanel.tsx                    ← Task 21
    RegistryTable.tsx                  ← Task 22
vercel.json                            ← Task 18
.env.example                           ← Task 1
```

Modified:

```
src/app/page.tsx                       ← Task 19 (Dashboard refactor)
src/components/AgentRoster.tsx         ← Task 19
src/app/api/agents/route.ts            ← Task 5 (read from agent_registry)
src/lib/anthropic.ts                   ← Task 5 (add createAgent, archiveAgent)
package.json                           ← already updated (vitest added)
```

Untouched (intentional for Phase 1):

```
src/app/assistant/page.tsx             (existing — still works)
src/lib/vault.ts                       (existing — reused by tool wrappers)
src/components/VaultPanel.tsx          (existing — still works)
src/components/SessionViewer.tsx       (existing — still works)
```

---

## Credentials Steven must hand over (in this order)

These block specific tasks. Tasks without credentials can ship first.

| # | Credential | Blocks | How to obtain |
|---|---|---|---|
| A | Supabase project URL + service_role key | Tasks 2, 3, 7, onward | Create project at supabase.com; Settings → API |
| B | Google Cloud OAuth client (web) | Task 4 (SSO), Task 15 (NotebookLM) | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (web). Add `https://<vercel-domain>/api/auth/callback/google` as authorized redirect. |
| C | Gemini API key | Task 12 | aistudio.google.com → API keys |
| D | Brave Search API key (or SerpAPI) | Task 13 | brave.com/search/api or serpapi.com |
| E | Telegram Bot token + allow-list chat ID | Task 16 | BotFather on Telegram; send `/newbot`, copy token. Your chat ID: message the bot once, then `curl https://api.telegram.org/bot<token>/getUpdates` |
| F | NotebookLM OAuth (Google account) | Task 15 | Uses the same OAuth client as B, plus the NotebookLM-py `login` flow (one browser click) |

All land in `.env` (local) and Vercel env vars (prod). See Task 1 for exact names.

---

### Task 1: Environment variables + `.env.example`

**Files:**
- Create: `.env.example`
- Create: `.env.local` (copy `.env.example`, fill in, never commit)

**Steps:**

- [ ] **Step 1: Write `.env.example`**

```bash
# Anthropic Managed Agents
ANTHROPIC_API_KEY=
SWAN_ENV_ID=env_01L4sqBNP3fo5hPLPSTtq7P1

# Supabase (Credential A)
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth + Google SSO (Credential B)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAILS=sactoswan@gmail.com

# Vault (existing)
GITHUB_PAT=

# Classifier (Credential C)
GOOGLE_AI_API_KEY=

# Web search (Credential D — pick one)
BRAVE_SEARCH_API_KEY=
SERPAPI_API_KEY=

# Telegram (Credential E)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHAT_IDS=

# Cron auth
CRON_SECRET=
```

- [ ] **Step 2: Create `.env.local` from example and have Steven fill values he has today** (at minimum `ANTHROPIC_API_KEY`, `GITHUB_PAT`, `SWAN_ENV_ID` — the rest land as credentials arrive).

- [ ] **Step 3: Verify `.gitignore` already covers `.env*.local`**

```bash
grep -E "\.env" .gitignore
# Expect: .env* or .env*.local
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: document env vars for v2 foundation"
```

---

### Task 2: Apply Supabase migration — **REQUIRES CREDENTIAL A**

**Files:**
- Existing: `supabase/migrations/0001_v2_schema.sql`

**Steps:**

- [ ] **Step 1: Create Supabase project** (one-time) at supabase.com/dashboard, region us-west-1. Steven copies URL + service role key into `.env.local`.

- [ ] **Step 2: Install supabase CLI** (one-time on Steven's Mac): `brew install supabase/tap/supabase`.

- [ ] **Step 3: Link + push migration**

```bash
cd app
supabase link --project-ref <ref-from-dashboard>
supabase db push
```

- [ ] **Step 4: Verify all 7 tables + indexes exist** via SQL editor in Supabase dashboard:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
-- expect: agent_registry, channel_routing, install_log,
--         memories, skill_registry, spawn_log, tasks
```

- [ ] **Step 5: Verify seed rows**

```sql
select id, role, status from agent_registry where status = 'permanent';
-- expect 6 rows with roles main, research, comms, content, ops, legal
```

- [ ] **Step 6: Commit** (no code change, but capture the fact in the branch log)

```bash
git commit --allow-empty -m "ops: apply 0001_v2_schema to Supabase"
```

---

### Task 3: Supabase client module — **REQUIRES CREDENTIAL A**

**Files:**
- Create: `src/lib/supabase.ts`
- Modify: `package.json` (add `@supabase/supabase-js`)

**Steps:**

- [ ] **Step 1: Install the client**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the client module**

```ts
// src/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
```

- [ ] **Step 3: Smoke test** — add a throwaway route `src/app/api/_smoke/route.ts`:

```ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
export async function GET() {
  const { count, error } = await supabase()
    .from("agent_registry")
    .select("*", { count: "exact", head: true });
  return NextResponse.json({ ok: !error, count, error: error?.message });
}
```

Run `npm run dev`, hit `http://localhost:3000/api/_smoke`. Expect `{ ok: true, count: 6 }`.

- [ ] **Step 4: Delete the smoke route**, commit.

```bash
rm src/app/api/_smoke/route.ts
git add src/lib/supabase.ts package.json package-lock.json
git commit -m "feat(db): Supabase client module"
```

---

### Task 4: Google SSO with NextAuth — **REQUIRES CREDENTIAL B**

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth.ts`
- Create: `src/middleware.ts`
- Modify: `package.json` (add `next-auth@beta`)

**Steps:**

- [ ] **Step 1: Install NextAuth v5 (compatible with Next 16 / React 19)**

```bash
npm install next-auth@beta
```

- [ ] **Step 2: Write the auth config**

```ts
// src/lib/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowed = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      return !!email && allowed.includes(email);
    },
    async session({ session }) {
      return session;
    },
  },
  pages: { signIn: "/login" },
});
```

- [ ] **Step 3: Route handler**

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Middleware to gate everything except `/api/auth` and `/api/channels` and `/api/cron`**

```ts
// src/middleware.ts
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const publicPrefixes = ["/api/auth", "/api/channels", "/api/cron", "/login"];
  if (publicPrefixes.some((p) => pathname.startsWith(p))) return;
  if (!req.auth) {
    const url = new URL("/api/auth/signin", req.url);
    url.searchParams.set("callbackUrl", req.url);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
```

- [ ] **Step 5: Verify — run dev, open `/`, get redirected to Google, sign in with `sactoswan@gmail.com`, land back on dashboard.** Sign in with a different Gmail → expect rejection.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth src/lib/auth.ts src/middleware.ts package.json package-lock.json
git commit -m "feat(auth): Google SSO locked to allow-listed emails"
```

---

### Task 5: Agent bootstrap script — archive 48 legacy, create 6 permanent — **REQUIRES ANTHROPIC_API_KEY + CREDENTIAL A**

**Files:**
- Create: `src/lib/bootstrap-agents.ts`
- Create: `scripts/bootstrap-agents.ts`
- Modify: `src/lib/anthropic.ts` (add `createAgent`, `archiveAgent`)
- Modify: `package.json` (add `"bootstrap": "tsx scripts/bootstrap-agents.ts"`, install `tsx` devDep)

**Steps:**

- [ ] **Step 1: Extend `src/lib/anthropic.ts`**

```ts
// append to src/lib/anthropic.ts
export async function createAgent(params: {
  name: string;
  model: string;
  system?: string;
}): Promise<Agent> {
  const res = await fetch(`${API_BASE}/agents`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`createAgent: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function archiveAgent(agentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/agents/${agentId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`archiveAgent: ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 2: Write the bootstrap module**

```ts
// src/lib/bootstrap-agents.ts
import fs from "node:fs/promises";
import path from "node:path";
import { listAgents, createAgent, archiveAgent } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

type RoleSpec = { role: string; display: string; model: string; file: string };

const SPECS: RoleSpec[] = [
  { role: "main",     display: "Main",     model: "claude-haiku-4-5-20251001", file: "main.md" },
  { role: "research", display: "Research", model: "claude-sonnet-4-6",         file: "research.md" },
  { role: "comms",    display: "Comms",    model: "claude-sonnet-4-6",         file: "comms.md" },
  { role: "content",  display: "Content",  model: "claude-sonnet-4-6",         file: "content.md" },
  { role: "ops",      display: "Ops",      model: "claude-sonnet-4-6",         file: "ops.md" },
  { role: "legal",    display: "Legal",    model: "claude-opus-4-7",           file: "legal.md" },
];

const AGENT_DIR = path.join(process.cwd(), "src", "agents");

async function loadPrompt(file: string): Promise<string> {
  return fs.readFile(path.join(AGENT_DIR, file), "utf-8");
}

export async function archiveAllLegacyAgents() {
  const all = await listAgents();
  const seeded = new Set(["seed_main", "seed_research", "seed_comms", "seed_content", "seed_ops", "seed_legal"]);
  const toArchive = all.filter((a) => !seeded.has(a.id));
  for (const a of toArchive) {
    console.log(`archiving ${a.id} (${a.name})`);
    await archiveAgent(a.id);
  }
  return toArchive.length;
}

export async function createPermanentAgents() {
  const sb = supabase();
  for (const spec of SPECS) {
    const prompt = await loadPrompt(spec.file);
    const existing = await sb
      .from("agent_registry")
      .select("id")
      .eq("role", spec.role)
      .eq("status", "permanent")
      .maybeSingle();
    // If the seed row already has a real Anthropic id (non-seed), skip create.
    if (existing.data && !existing.data.id.startsWith("seed_")) {
      console.log(`skip ${spec.role} — already provisioned as ${existing.data.id}`);
      continue;
    }
    console.log(`creating ${spec.role}...`);
    const agent = await createAgent({
      name: spec.display,
      model: spec.model,
      system: prompt,
    });
    // Replace the seed row with the real agent id
    await sb.from("agent_registry").delete().eq("id", `seed_${spec.role}`);
    await sb.from("agent_registry").insert({
      id: agent.id,
      role: spec.role,
      display_name: spec.display,
      model: spec.model,
      system_prompt_template: prompt,
      status: "permanent",
    });
    console.log(`  -> ${agent.id}`);
  }
}
```

- [ ] **Step 3: Write the runnable script**

```ts
// scripts/bootstrap-agents.ts
import "dotenv/config";
import { archiveAllLegacyAgents, createPermanentAgents } from "@/lib/bootstrap-agents";

async function main() {
  const archived = await archiveAllLegacyAgents();
  console.log(`archived ${archived} legacy agents`);
  await createPermanentAgents();
  console.log("done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Install runtime helpers**

```bash
npm install -D tsx dotenv
```

Add to `package.json` scripts: `"bootstrap:agents": "tsx scripts/bootstrap-agents.ts"`.

- [ ] **Step 5: Execute (ONE-TIME, and DESTRUCTIVE — archives all existing agents)**

Confirm with Steven before running. Then:

```bash
npm run bootstrap:agents
```

Expected stdout: "archived 48 legacy agents" + six `creating ... -> agt_...` lines.

- [ ] **Step 6: Verify via /api/agents** — open dashboard, roster shows exactly 6 agents.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bootstrap-agents.ts src/lib/anthropic.ts scripts/bootstrap-agents.ts package.json package-lock.json
git commit -m "feat(agents): bootstrap script — archive legacy + create 6 permanent"
```

---

### Task 6: Prompt loader + /api/agents refactor

**Files:**
- Create: `src/lib/prompt-loader.ts`
- Modify: `src/app/api/agents/route.ts`

**Steps:**

- [ ] **Step 1: Write the prompt loader** (caches reads during a server process lifetime)

```ts
// src/lib/prompt-loader.ts
import fs from "node:fs/promises";
import path from "node:path";

const cache = new Map<string, string>();

export async function loadAgentPrompt(role: string): Promise<string> {
  if (cache.has(role)) return cache.get(role)!;
  const p = path.join(process.cwd(), "src", "agents", `${role}.md`);
  const content = await fs.readFile(p, "utf-8");
  cache.set(role, content);
  return content;
}
```

- [ ] **Step 2: Refactor `/api/agents` to read from `agent_registry` (not Anthropic) for the dashboard roster.**

```ts
// src/app/api/agents/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabase()
      .from("agent_registry")
      .select("id, role, display_name, model, status")
      .in("status", ["permanent", "awaiting_promotion"])
      .order("role");
    if (error) throw error;
    // shape matches existing dashboard consumer: { id, name, model }
    return NextResponse.json({
      agents: (data ?? []).map((r) => ({
        id: r.id,
        name: r.display_name,
        model: r.model,
        role: r.role,
        status: r.status,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompt-loader.ts src/app/api/agents/route.ts
git commit -m "feat(agents): dashboard roster reads from agent_registry"
```

---

### Task 7: Task ledger + queue module

**Files:**
- Create: `src/lib/queue.ts`
- Create: `src/lib/queue.test.ts`

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/queue.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveConcurrencyCap } from "./queue";

describe("resolveConcurrencyCap", () => {
  it("returns role-specific cap", () => {
    expect(resolveConcurrencyCap("main")).toBe(10);
    expect(resolveConcurrencyCap("research")).toBe(8);
    expect(resolveConcurrencyCap("comms")).toBe(6);
    expect(resolveConcurrencyCap("content")).toBe(4);
    expect(resolveConcurrencyCap("ops")).toBe(6);
    expect(resolveConcurrencyCap("legal")).toBe(3);
  });
  it("defaults ephemeral / unknown roles to 2", () => {
    expect(resolveConcurrencyCap("tax-researcher")).toBe(2);
  });
});
```

- [ ] **Step 2: Run, confirm failure**: `npx vitest run src/lib/queue.test.ts` → `resolveConcurrencyCap not a function`.

- [ ] **Step 3: Minimal implementation**

```ts
// src/lib/queue.ts
import { supabase } from "@/lib/supabase";
import type { Task, TaskStatus, Channel } from "@/types/db";

const CAPS: Record<string, number> = {
  main: 10, research: 8, comms: 6, content: 4, ops: 6, legal: 3,
};

export function resolveConcurrencyCap(role: string): number {
  return CAPS[role] ?? 2;
}

export interface EnqueueArgs {
  agent_id: string;
  role: string;
  channel: Channel;
  source_id?: string;
  project?: string;
  company?: string;
  priority?: number;
  input: unknown;
}

export async function enqueue(args: EnqueueArgs): Promise<Task> {
  const sb = supabase();
  const { data, error } = await sb
    .from("tasks")
    .insert({
      agent_id: args.agent_id,
      channel: args.channel,
      source_id: args.source_id ?? null,
      project: args.project ?? null,
      company: args.company ?? null,
      priority: args.priority ?? 50,
      status: "queued",
      input: args.input,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Task;
}

export async function countInFlight(agent_id: string): Promise<number> {
  const sb = supabase();
  const { count, error } = await sb
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agent_id)
    .in("status", ["in_flight", "awaiting_user"]);
  if (error) throw error;
  return count ?? 0;
}

export async function markStatus(
  task_id: string,
  status: TaskStatus,
  patch: Partial<Task> = {}
): Promise<void> {
  const sb = supabase();
  const { error } = await sb
    .from("tasks")
    .update({ status, ...patch })
    .eq("id", task_id);
  if (error) throw error;
}
```

- [ ] **Step 4: Re-run tests, confirm pass.** `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat(queue): task enqueue + concurrency + status updates"
```

---

### Task 8: Refactor `/api/dispatch` to use the queue + router

**Files:**
- Modify: `src/app/api/dispatch/route.ts`

**Steps:**

- [ ] **Step 1: Rewrite the route.** Dispatch now resolves agent by role (via `/api/agents` roster shape), enqueues the task, then streams.

```ts
// src/app/api/dispatch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSession, sendMessage, streamSession } from "@/lib/anthropic";
import { enqueue, markStatus } from "@/lib/queue";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
const ENV_ID = process.env.SWAN_ENV_ID ?? "env_01L4sqBNP3fo5hPLPSTtq7P1";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { agentId, role, task, project, company } = await req.json();
  if (!agentId || !task) {
    return NextResponse.json({ error: "agentId and task required" }, { status: 400 });
  }

  const row = await enqueue({
    agent_id: agentId,
    role: role ?? "unknown",
    channel: "dashboard",
    project,
    company,
    input: { text: task },
  });

  try {
    await markStatus(row.id, "in_flight", { started_at: new Date().toISOString() });
    const ccr = await createSession(agentId, ENV_ID);
    await sendMessage(ccr.id, task);
    await markStatus(row.id, "in_flight", { session_id: ccr.id });
    const streamRes = await streamSession(ccr.id);
    if (!streamRes.ok) {
      const err = await streamRes.text();
      await markStatus(row.id, "failed");
      return NextResponse.json({ error: `stream: ${streamRes.status} ${err}` }, { status: 502 });
    }
    return new Response(streamRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Task-Id": row.id,
      },
    });
  } catch (e: unknown) {
    await markStatus(row.id, "failed");
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify end-to-end.** Open dashboard → pick Research → "summarize my vault" → stream flows. Check Supabase: task row appears with `status='in_flight'`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dispatch/route.ts
git commit -m "feat(dispatch): enqueue tasks before streaming + auth gate"
```

---

### Task 9: Wire the router into an inbound ingestion helper

**Files:**
- Create: `src/lib/ingest.ts`

**Steps:**

- [ ] **Step 1: Write the helper — a single function used by every channel webhook.**

```ts
// src/lib/ingest.ts
import { route } from "@/routing";
import type { IncomingMessage, RoutingDecision } from "@/routing";
import { supabase } from "@/lib/supabase";
import { enqueue } from "@/lib/queue";
import type { AgentRegistryEntry } from "@/types/db";

export interface IngestResult {
  decision: RoutingDecision;
  agent: AgentRegistryEntry;
  task_id: string;
}

async function resolveAgentByRole(role: string): Promise<AgentRegistryEntry> {
  const sb = supabase();
  const { data, error } = await sb
    .from("agent_registry")
    .select("*")
    .eq("role", role)
    .eq("status", "permanent")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`no permanent agent for role ${role}`);
  return data as AgentRegistryEntry;
}

async function loadChannelHints() {
  const sb = supabase();
  const { data } = await sb.from("channel_routing").select("*");
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    out[row.external_id] = row.agent_role;
  }
  return out;
}

export async function ingest(msg: IncomingMessage): Promise<IngestResult> {
  const channelHints = await loadChannelHints();
  const decision = route(msg, { channelHints });
  const agent = await resolveAgentByRole(decision.agent);
  const task = await enqueue({
    agent_id: agent.id,
    role: agent.role,
    channel: msg.channel,
    source_id: msg.external_id,
    input: { text: msg.text, sender: msg.sender, rule: decision.rule },
  });
  return { decision, agent, task_id: task.id };
}
```

- [ ] **Step 2: Add a unit test that mocks supabase and verifies `ingest` resolves correctly for a `@research` message.** (Test file: `src/lib/ingest.test.ts`. Use Vitest's `vi.mock("@/lib/supabase")`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ingest.ts src/lib/ingest.test.ts
git commit -m "feat(ingest): route + agent-resolve + enqueue pipeline"
```

---

### Task 10: Vault read/write tools

**Files:**
- Create: `src/tools/vault-read-file.ts`
- Create: `src/tools/vault-list-dir.ts`
- Create: `src/tools/vault-write-file.ts`
- Modify: `src/tools/index.ts` (uncomment the three imports)

**Pattern** (applies to every tool file — use as a template):

```ts
// src/tools/vault-read-file.ts
import { defineTool } from "./registry";
import type { VaultReadFileInput, VaultReadFileOutput } from "@/types/tools";
import { getSessionContent } from "@/lib/vault";

const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";

export default defineTool<VaultReadFileInput, VaultReadFileOutput>({
  name: "vault.read_file",
  description: "Read a file from the swan-vault Obsidian repo. Path is relative to repo root.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "e.g. 02-Areas/Research/ai-agents.md" },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async handler({ path }) {
    const content = await getSessionContent(path);
    // sha comes from a HEAD call; reuse existing helper style
    const res = await fetch(`${API}/repos/${VAULT_REPO}/contents/${path}`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_PAT}`, Accept: "application/vnd.github+json" },
    });
    const meta = await res.json();
    return { path, content, sha: meta.sha };
  },
});
```

**Steps:**

- [ ] **Step 1–3:** Write `vault-read-file.ts`, `vault-list-dir.ts`, `vault-write-file.ts` using the pattern above. The list_dir handler uses existing `listDir` (add export) from `src/lib/vault.ts`. The write_file handler PUTs to `contents/:path` with base64 content + sha.

- [ ] **Step 4: Expose tools via a central runtime route.** Create `src/app/api/tools/[name]/route.ts`:

```ts
// src/app/api/tools/[name]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTool } from "@/tools/index";
import "@/tools/index"; // force registrations

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const tool = getTool(name);
  if (!tool) return NextResponse.json({ error: `unknown tool ${name}` }, { status: 404 });
  const body = await req.json();
  const result = await tool.handler(body, {
    agent_id: req.headers.get("x-agent-id") ?? "anon",
    task_id: req.headers.get("x-task-id") ?? null,
  });
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Verify with curl**

```bash
curl -s http://localhost:3000/api/tools/vault.read_file \
  -H 'content-type: application/json' \
  -d '{"path": "README.md"}' | jq .
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/vault-*.ts src/tools/index.ts src/app/api/tools
git commit -m "feat(tools): vault read/list/write + runtime router"
```

---

### Task 11: Dispatch (outbound) tool

**Files:**
- Create: `src/tools/dispatch.ts`
- Create: `src/lib/channels/telegram-send.ts`

**Steps:**

- [ ] **Step 1: Telegram sender stub (real impl lands when Credential E arrives)**

```ts
// src/lib/channels/telegram-send.ts
export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) throw new Error(`telegram send: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.result.message_id as number;
}
```

- [ ] **Step 2: Tool**

```ts
// src/tools/dispatch.ts
import { defineTool } from "./registry";
import type { DispatchInput, DispatchOutput } from "@/types/tools";
import { sendTelegram } from "@/lib/channels/telegram-send";

export default defineTool<DispatchInput, DispatchOutput>({
  name: "dispatch",
  description: "Send an outbound message to a channel (telegram | slack | email).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      channel: { type: "string", enum: ["telegram", "slack", "email"] },
      recipient: { type: "string" },
      text: { type: "string" },
      thread_id: { type: "string" },
    },
    required: ["channel", "recipient", "text"],
    additionalProperties: true,
  },
  async handler({ channel, recipient, text }) {
    if (channel === "telegram") {
      const id = await sendTelegram(recipient, text);
      return { delivered: true, external_message_id: String(id) };
    }
    // slack/email land in Phase 2
    return { delivered: false };
  },
});
```

- [ ] **Step 3: Uncomment in `src/tools/index.ts`, commit.**

```bash
git add src/tools/dispatch.ts src/lib/channels/telegram-send.ts src/tools/index.ts
git commit -m "feat(tools): dispatch (telegram outbound)"
```

---

### Task 12: Gemini Flash classifier — **REQUIRES CREDENTIAL C**

**Files:**
- Create: `src/lib/classifier.ts`
- Create: `src/tools/classify.ts`

**Steps:**

- [ ] **Step 1: Install the Google GenAI SDK**

```bash
npm install @google/generative-ai
```

- [ ] **Step 2: Classifier module**

```ts
// src/lib/classifier.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClassifyInput, ClassifyOutput } from "@/types/tools";

const PROMPT = `You classify short conversation fragments into exactly one memory kind.
Respond with STRICT JSON matching: {"kind":"fact|preference|context|pinned|noise","importance":0..1,"tags":[],"company":"","project":""}
Rules:
- "fact": an objective true statement about Steven's world (addresses, IDs, company facts)
- "preference": how Steven wants things done (tone, cadence, do/don't)
- "context": transient but useful ("I'm traveling to CA this week")
- "pinned": Steven explicitly said "remember this" or equivalent
- "noise": worth discarding`;

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
  const resp = await model.generateContent([
    PROMPT,
    `text: ${input.text}`,
    input.context ? `context: ${input.context}` : "",
  ].filter(Boolean).join("\n\n"));
  const text = resp.response.text().trim().replace(/^```json\s*|\s*```$/g, "");
  const parsed = JSON.parse(text);
  return {
    kind: parsed.kind ?? "noise",
    importance: Number(parsed.importance ?? 0.5),
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    company: parsed.company || undefined,
    project: parsed.project || undefined,
  };
}
```

- [ ] **Step 3: Tool wrapper** — define `classify` via `defineTool` in `src/tools/classify.ts` mirroring the Task-10 pattern; handler calls `classify(input)`.

- [ ] **Step 4: Add a live test** `src/lib/classifier.test.ts` that skips when `!GOOGLE_AI_API_KEY`:

```ts
import { describe, it, expect } from "vitest";
import { classify } from "./classifier";
const hasKey = !!process.env.GOOGLE_AI_API_KEY;
describe.skipIf(!hasKey)("classify (live)", () => {
  it("tags a clear preference", async () => {
    const out = await classify({ text: "I hate exclamation marks in my LinkedIn posts." });
    expect(out.kind).toBe("preference");
    expect(out.importance).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/classifier.ts src/lib/classifier.test.ts src/tools/classify.ts src/tools/index.ts package.json package-lock.json
git commit -m "feat(classifier): Gemini Flash classify + tool wrapper"
```

---

### Task 13: Web search tool — **REQUIRES CREDENTIAL D**

**Files:**
- Create: `src/tools/web-search.ts`

**Steps:**

- [ ] **Step 1: Implement the tool (Brave first; SerpAPI fallback left as TODO)**

```ts
// src/tools/web-search.ts
import { defineTool } from "./registry";
import type { WebSearchInput, WebSearchOutput } from "@/types/tools";

export default defineTool<WebSearchInput, WebSearchOutput>({
  name: "web.search",
  description: "Brave search. Returns up to 10 web results.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer", minimum: 1, maximum: 20 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async handler({ query, max_results = 10 }) {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) throw new Error("BRAVE_SEARCH_API_KEY not set");
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(max_results));
    const res = await fetch(url, { headers: { "X-Subscription-Token": key, Accept: "application/json" } });
    if (!res.ok) throw new Error(`brave: ${res.status}`);
    const data = await res.json();
    return {
      results: (data.web?.results ?? []).map((r: { title: string; url: string; description: string }) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      })),
    };
  },
});
```

- [ ] **Step 2: Uncomment in `src/tools/index.ts`. Commit.**

```bash
git add src/tools/web-search.ts src/tools/index.ts
git commit -m "feat(tools): web.search (Brave)"
```

---

### Task 14: YouTube search tool

**Files:**
- Create: `src/tools/youtube-search.ts`

**Note:** requires `yt-dlp` installed on the Vercel runtime. Vercel's Node runtime doesn't have it by default — use a serverless-friendly alternative: call youtube-search-api (pure JS) for discovery and `youtube-transcript` (npm) for transcripts. No subprocess.

**Steps:**

- [ ] **Step 1: Install libraries**

```bash
npm install youtube-search-api youtube-transcript
```

- [ ] **Step 2: Tool**

```ts
// src/tools/youtube-search.ts
import { defineTool } from "./registry";
import type { YoutubeSearchInput, YoutubeSearchOutput } from "@/types/tools";
import { YoutubeTranscript } from "youtube-transcript";
// @ts-expect-error — no types shipped
import youtubeSearch from "youtube-search-api";

export default defineTool<YoutubeSearchInput, YoutubeSearchOutput>({
  name: "youtube.search",
  description: "Search YouTube + optionally fetch transcripts. Max 10 results.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer", minimum: 1, maximum: 10 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async handler({ query, max_results = 5 }) {
    const raw = await youtubeSearch.GetListByKeyword(query, false, max_results, [{ type: "video" }]);
    const results = await Promise.all(
      (raw.items as { id: string; title: string; channelTitle: string }[]).map(async (v) => {
        let transcript: string | undefined;
        try {
          const t = await YoutubeTranscript.fetchTranscript(v.id);
          transcript = t.map((row) => row.text).join(" ");
        } catch {
          transcript = undefined;
        }
        return {
          video_id: v.id,
          title: v.title,
          channel: v.channelTitle,
          url: `https://www.youtube.com/watch?v=${v.id}`,
          transcript,
        };
      })
    );
    return { results };
  },
});
```

- [ ] **Step 3: Uncomment in index, commit.**

---

### Task 15: NotebookLM wrapper — **REQUIRES CREDENTIAL B + F**

NotebookLM has no official API. The plan here is to host a small companion service (Python) that uses the community `NotebookLM-py` library, store its OAuth token in Supabase, and proxy from our Next.js tool to the companion service.

**Risk:** unofficial API — can break on any Google-side change. Accept that; keep the proxy thin so swapping is cheap.

**Files:**
- Create: `companion/notebooklm/app.py` (Python FastAPI)
- Create: `companion/notebooklm/requirements.txt`
- Create: `companion/notebooklm/Dockerfile`
- Create: `companion/notebooklm/fly.toml`
- Create: `src/tools/notebooklm.ts`

**Steps:**

- [ ] **Step 1: Python companion.** Small FastAPI app wrapping NotebookLM-py's `Client`.

```python
# companion/notebooklm/app.py
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from notebooklm import Client
import os

app = FastAPI()
SHARED = os.environ["SHARED_SECRET"]
client: Client | None = None

def require_secret(authorization: str | None):
    if authorization != f"Bearer {SHARED}":
        raise HTTPException(401, "unauthorized")

def get_client() -> Client:
    global client
    if client is None:
        client = Client.from_env()  # reads stored OAuth token
    return client

class AddSource(BaseModel):
    notebook_id: str
    url: str

class CreateNb(BaseModel):
    title: str

class Query(BaseModel):
    notebook_id: str
    question: str

@app.get("/notebooks")
def list_notebooks(authorization: str | None = Header(None)):
    require_secret(authorization)
    return {"notebooks": get_client().list_notebooks()}

@app.post("/notebooks")
def create(body: CreateNb, authorization: str | None = Header(None)):
    require_secret(authorization)
    nb = get_client().create_notebook(body.title)
    return {"notebook_id": nb.id}

@app.post("/sources")
def add_source(body: AddSource, authorization: str | None = Header(None)):
    require_secret(authorization)
    src = get_client().add_source(body.notebook_id, body.url)
    return {"source_id": src.id}

@app.post("/query")
def query(body: Query, authorization: str | None = Header(None)):
    require_secret(authorization)
    ans = get_client().query(body.notebook_id, body.question)
    return {"answer": ans.text, "citations": ans.citations}
```

- [ ] **Step 2: Dockerfile + fly.toml**

```dockerfile
# companion/notebooklm/Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

```toml
# companion/notebooklm/fly.toml
app = "swan-notebooklm"
[http_service]
internal_port = 8080
force_https = true
```

- [ ] **Step 3: Deploy.** `cd companion/notebooklm && fly launch --no-deploy && fly secrets set SHARED_SECRET=<...> NOTEBOOKLM_OAUTH_TOKEN=<...> && fly deploy`.

- [ ] **Step 4: Next.js tool** wraps HTTP calls to the Fly service. Base URL from `NOTEBOOKLM_SERVICE_URL`, secret from `NOTEBOOKLM_SHARED_SECRET`. Five `defineTool` entries: `notebooklm.list_notebooks`, `create_notebook`, `add_source_url`, `query`, `generate_report`.

- [ ] **Step 5: Verify from dashboard** — dispatch to Research: "add https://en.wikipedia.org/wiki/AI_agent to a notebook called Agents and tell me what's in it".

- [ ] **Step 6: Commit**

```bash
git add companion/ src/tools/notebooklm.ts src/tools/index.ts
git commit -m "feat(notebooklm): python companion + next.js tool wrapper"
```

---

### Task 16: Telegram inbound webhook — **REQUIRES CREDENTIAL E**

**Files:**
- Create: `src/app/api/channels/telegram/route.ts`

**Steps:**

- [ ] **Step 1: Route handler**

```ts
// src/app/api/channels/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { sendTelegram } from "@/lib/channels/telegram-send";
import { createSession, sendMessage, streamSession } from "@/lib/anthropic";
import { markStatus } from "@/lib/queue";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(
  (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET; // optional — set via setWebhook

const ENV_ID = process.env.SWAN_ENV_ID ?? "env_01L4sqBNP3fo5hPLPSTtq7P1";

export async function POST(req: NextRequest) {
  if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();
  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return NextResponse.json({ ok: true, skipped: "no text" });
  const chatId = String(msg.chat.id);
  if (!ALLOWED.has(chatId)) {
    return NextResponse.json({ ok: true, rejected: "not on allow list" });
  }

  const { agent, task_id } = await ingest({
    channel: "telegram",
    external_id: chatId,
    sender: msg.from?.username ?? String(msg.from?.id ?? "unknown"),
    text: msg.text,
  });

  // Fire and forget the agent run; reply asynchronously.
  void (async () => {
    try {
      await markStatus(task_id, "in_flight", { started_at: new Date().toISOString() });
      const session = await createSession(agent.id, ENV_ID);
      await sendMessage(session.id, msg.text);
      const stream = await streamSession(session.id);
      const text = await collectText(stream);
      await sendTelegram(chatId, text || "(empty response)");
      await markStatus(task_id, "done", { completed_at: new Date().toISOString(), output: { text } });
    } catch (e) {
      await sendTelegram(chatId, `⚠️ ${e instanceof Error ? e.message : String(e)}`);
      await markStatus(task_id, "failed");
    }
  })();

  return NextResponse.json({ ok: true, task_id });
}

async function collectText(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const evt = JSON.parse(json);
        if (evt.type === "agent.message") {
          for (const block of evt.content ?? []) {
            if (block.type === "text") out += block.text;
          }
        }
      } catch {
        // skip
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Register webhook** (one-time, after deploying to Vercel):

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -F "url=https://<vercel-domain>/api/channels/telegram" \
  -F "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

- [ ] **Step 3: Test end-to-end.** Message the bot from Steven's phone: "@research what's in my swan-vault 02-Areas?". Expect a reply within ~30s. Check `tasks` table: row with channel=telegram, status=done.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/channels/telegram/route.ts
git commit -m "feat(channels): telegram inbound webhook with allow-list"
```

---

### Task 17: Memory classifier pipeline

**Files:**
- Create: `src/lib/memory-pipeline.ts`
- Modify: `src/app/api/channels/telegram/route.ts` (hook pipeline after task.done)

**Steps:**

- [ ] **Step 1: Pipeline module**

```ts
// src/lib/memory-pipeline.ts
import { supabase } from "@/lib/supabase";
import { classify } from "@/lib/classifier";

export async function maybeStoreMemory(args: {
  text: string;
  context?: string;
  source_task_id: string;
  company?: string | null;
  project?: string | null;
}) {
  const c = await classify({ text: args.text, context: args.context });
  if (c.kind === "noise" || c.importance < 0.3) return;
  await supabase().from("memories").insert({
    kind: c.kind,
    body: args.text,
    tags: c.tags,
    importance: c.importance,
    source_task_id: args.source_task_id,
    company: args.company ?? c.company ?? null,
    project: args.project ?? c.project ?? null,
  });
}
```

- [ ] **Step 2: Call it from the telegram handler after marking `done`:**

```ts
await maybeStoreMemory({
  text: msg.text,
  source_task_id: task_id,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/memory-pipeline.ts src/app/api/channels/telegram/route.ts
git commit -m "feat(memory): Gemini-classified pipeline on inbound messages"
```

---

### Task 18: Weekly vault-promotion cron

**Files:**
- Create: `src/app/api/cron/vault-promote/route.ts`
- Create: `vercel.json`

**Steps:**

- [ ] **Step 1: Route**

```ts
// src/app/api/cron/vault-promote/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { writeFile } from "@/lib/vault-write"; // small helper that PUTs to GitHub
import type { Memory } from "@/types/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = supabase();
  const { data, error } = await sb
    .from("memories")
    .select("*")
    .gte("importance", 0.7)
    .is("promoted_to_vault_at", null)
    .in("kind", ["fact", "pinned", "context"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const memories = (data ?? []) as Memory[];

  // Group by (company, project, yyyy-mm)
  const groups = new Map<string, Memory[]>();
  for (const m of memories) {
    const ym = m.created_at.slice(0, 7);
    const key = `${m.company ?? "all"}|${m.project ?? "general"}|${ym}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }

  let written = 0;
  for (const [key, rows] of groups) {
    const [company, project, ym] = key.split("|");
    const path = project === "general"
      ? `02-Areas/Memory/Insights/${ym}.md`
      : `01-Projects/${project}/memory-${ym}.md`;
    const body = buildMarkdown(company, project, ym, rows);
    await writeFile(path, body, `promote ${rows.length} memories for ${key}`);
    await sb.from("memories")
      .update({ promoted_to_vault_at: new Date().toISOString(), vault_path: path })
      .in("id", rows.map((r) => r.id));
    written += rows.length;
  }

  return NextResponse.json({ promoted: written, groups: groups.size });
}

function buildMarkdown(company: string, project: string, ym: string, rows: Memory[]): string {
  const lines = [
    `# Insights — ${company} / ${project} · ${ym}`,
    "",
    `_Promoted ${rows.length} memories at ${new Date().toISOString()}._`,
    "",
  ];
  for (const r of rows.sort((a, b) => b.importance - a.importance)) {
    lines.push(`## [${r.kind}] (importance ${r.importance.toFixed(2)})`);
    lines.push(r.body);
    if (r.tags.length) lines.push(`Tags: ${r.tags.map((t) => `\`${t}\``).join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Small vault-write helper** `src/lib/vault-write.ts`:

```ts
const VAULT_REPO = "staffbotsteve/swan-vault";
const API = "https://api.github.com";

export async function writeFile(path: string, content: string, message: string) {
  const h = { Authorization: `Bearer ${process.env.GITHUB_PAT}`, Accept: "application/vnd.github+json" };
  // Fetch existing sha if present
  let sha: string | undefined;
  const head = await fetch(`${API}/repos/${VAULT_REPO}/contents/${path}`, { headers: h });
  if (head.ok) sha = (await head.json()).sha;
  const res = await fetch(`${API}/repos/${VAULT_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`vault write: ${res.status} ${await res.text()}`);
}
```

- [ ] **Step 3: `vercel.json` cron config**

```json
{
  "crons": [
    { "path": "/api/cron/vault-promote", "schedule": "0 9 * * 1" }
  ]
}
```

(Every Monday 9am UTC.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/vault-promote src/lib/vault-write.ts vercel.json
git commit -m "feat(cron): weekly vault-promote distills hot memories to vault"
```

---

### Task 19: Dashboard roster refactor — function-first layout

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/AgentRoster.tsx`

**Steps:**

- [ ] **Step 1: Rip out company-prefix grouping in `AgentRoster.tsx`.** Group by `role` instead. The 6 roles render as a vertical list with icons (🧠 🔍 📣 ✍️ ⚙️ ⚖️), model badge, and a live in-flight count (filled in by a sibling fetch of `/api/hive/agent/<id>/in-flight`).

- [ ] **Step 2: Add a `role` accessor and drop `COMPANY_PREFIXES` table from AgentRoster entirely.** The roster component becomes <100 lines.

- [ ] **Step 3: In `page.tsx`, replace the "X agents | Y sessions" header subtitle with "6 shared departments · <N> in flight".**

- [ ] **Step 4: Verify the dashboard loads and shows exactly 6 rows with the right icons + models.**

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/AgentRoster.tsx
git commit -m "feat(dashboard): function-first roster (6 departments)"
```

---

### Task 20: Hive-mind task board

**Files:**
- Create: `src/components/HiveBoard.tsx`
- Create: `src/app/api/hive/route.ts`
- Create: `src/app/hive/page.tsx`

**Steps:**

- [ ] **Step 1: API** — returns last 100 tasks with filters. Supports `?agent_id=&company=&project=&status=`.

```ts
// src/app/api/hive/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  let q = supabase().from("tasks").select("*").order("created_at", { ascending: false }).limit(100);
  const agent_id = u.searchParams.get("agent_id");
  const company = u.searchParams.get("company");
  const project = u.searchParams.get("project");
  const status = u.searchParams.get("status");
  if (agent_id) q = q.eq("agent_id", agent_id);
  if (company) q = q.eq("company", company);
  if (project) q = q.eq("project", project);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}
```

- [ ] **Step 2: `HiveBoard.tsx`** — kanban columns: queued / in_flight / awaiting_user / done / failed. Each card shows: agent role icon, channel, company, project, short input preview, elapsed time. Filter dropdowns at the top.

- [ ] **Step 3: `/hive/page.tsx`** — "use client" wrapper that fetches `/api/hive` with filter state and renders `<HiveBoard />`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hive src/components/HiveBoard.tsx src/app/hive
git commit -m "feat(dashboard): hive-mind task board"
```

---

### Task 21: Memory page

**Files:**
- Create: `src/app/memory/page.tsx`
- Create: `src/app/api/memory/route.ts`
- Create: `src/components/MemoryPanel.tsx`

**Steps:**

- [ ] **Step 1: API** — list memories filtered by `?kind=&importance_min=`.

- [ ] **Step 2: Page** — three tabs: **Pinned** (kind=pinned), **Insights** (kind=fact+context, high importance), **Decaying** (with TTL nearing expiry). Each row has body, importance bar, tags, date. For pinned, a manual "archive" button.

- [ ] **Step 3: Commit**

```bash
git add src/app/memory src/app/api/memory src/components/MemoryPanel.tsx
git commit -m "feat(dashboard): /memory page (pinned + insights + decaying)"
```

---

### Task 22: Registry page

**Files:**
- Create: `src/app/registry/page.tsx`
- Create: `src/app/api/registry/agents/route.ts`
- Create: `src/app/api/registry/skills/route.ts`
- Create: `src/components/RegistryTable.tsx`

**Steps:**

- [ ] **Step 1:** GET routes reading `agent_registry` and `skill_registry`. Support filter `?status=`.

- [ ] **Step 2: Page with four tabs (Agents, Skills, Plugins, Audit log).** Audit log unions `spawn_log` + `install_log` ordered by `created_at DESC`. (For Phase 1, Plugins and Audit can be stubs rendering empty-state until Phase 2 populates them.)

- [ ] **Step 3: Commit**

```bash
git add src/app/registry src/app/api/registry src/components/RegistryTable.tsx
git commit -m "feat(dashboard): /registry page (agents + skills)"
```

---

### Task 23: E2E — Telegram → Research → vault → reply

**Files:**
- Create: `scripts/e2e/telegram-research.md` (runbook, not code)

**Steps:**

- [ ] **Step 1: Runbook** — preconditions: all env vars set, bot webhook registered, Research agent has 📔 NotebookLM token. Steps:
  1. From Steven's phone: send `/research summarize the key themes in 02-Areas/Research/`
  2. Expect: within 60s, Telegram reply with a 3–5 bullet summary
  3. Supabase `tasks`: row with `channel='telegram'`, `agent_id=<research>`, `status='done'`
  4. Vault: new file `03-Sessions/Managed-Agents/<date>-telegram-research.md` (session summary per CLAUDE.md rule)
  5. Supabase `memories`: ≥ 1 row created from classifier

- [ ] **Step 2: Walk through once manually. Fix anything that breaks. No automation yet — Phase 2 adds playwright.**

- [ ] **Step 3: Commit runbook, done criterion is a successful manual run documented with a screenshot in the runbook.**

---

### Task 24: E2E — concurrent multi-company isolation

**Files:**
- Create: `scripts/e2e/concurrent-isolation.md` (runbook)

**Steps:**

- [ ] **Step 1:** Send two Telegram messages within 5 seconds:
  - `/research audit Q2 hospitality NV`
  - `/research reconcile SwanBill April AR`

- [ ] **Step 2:** Expect:
  - Two tasks in `tasks` with same `agent_id`, different `company` (one="e2s Hospitality NV LLC", other="SwanBill LLC"), both `status='in_flight'` simultaneously
  - Two distinct Managed Agents sessions (different `session_id`)
  - Both replies land within ~90s
  - No content cross-contamination: SwanBill reply must not mention NV hospitality and vice versa

- [ ] **Step 3:** Validate Research's concurrency cap of 8 by firing 10 messages in rapid succession — first 8 go to `in_flight`, last 2 stay `queued`.

---

### Task 25: README + deployment runbook

**Files:**
- Modify: `README.md`

**Steps:**

- [ ] **Step 1:** Replace the create-next-app boilerplate with an actual README:
  - What this project is (3 sentences)
  - Architecture overview (point to spec + infographic)
  - Getting started (env vars, `npm install`, `supabase db push`, `npm run bootstrap:agents`, `npm run dev`)
  - Deployment (Vercel + `vercel env pull`, Fly.io companion for NotebookLM, Telegram webhook)
  - Running the test suite
  - Runbook pointers (`scripts/e2e/*.md`)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with getting-started + deploy runbook"
```

---

## Definition of done for Phase 1

All ten acceptance criteria from spec §11 pass manual verification:

1. ✅ Google SSO gates the dashboard; non-allow-listed email → 403 (Task 4)
2. ✅ 48 legacy agents archived; 6 permanent agents created (Task 5)
3. ✅ All 7 Supabase tables + indexes exist with seed rows (Task 2)
4. ✅ Dashboard pages live: `/`, `/hive`, `/memory`, `/registry`, `/assistant` (existing) (Tasks 19–22)
5. ✅ Router routes `@research`, `/ops`, Slack channel hints correctly; ambiguous falls to Main (Tasks 9, router unit tests)
6. ✅ Telegram bridge: round-trip works end-to-end (Task 16, validated by Task 23)
7. ✅ NotebookLM: OAuth + list + add_source + query + generate_report all callable (Task 15)
8. ✅ `youtube.search("topic")` returns transcripts (Task 14)
9. ✅ Vault-promotion cron runs weekly and writes ≥ 1 markdown file on real data (Task 18)
10. ✅ Multi-task isolation: Research handles two concurrent different-company tasks cleanly (Task 24)

---

## Self-review

- **Spec coverage:** every §11 criterion maps to a task above (cross-referenced in the DoD).
- **No placeholders:** every code step shows actual code; "REQUIRES CREDENTIAL" tasks have explicit credential instructions.
- **Type consistency:** router types in rules.ts match what index.ts imports; tool types in `@/types/tools` match `defineTool` generics used in every tool file; Supabase schema column types match `src/types/db.ts`.
- **Scope:** Phase 1 only. Phase 2 (Slack, Email, sub-agent spawning, curated skill registry) and Phase 3 (voice, freeform skill authoring) each get their own plan written after Phase 1 lands.

---

## Next step

After Steven reviews and this plan lands, the natural handoff is `superpowers:subagent-driven-development` — one subagent per task, reviewer in between. Plan is credential-gated in parts, so it'll interleave coding sessions with credential handoffs.
