# Swan Command Center v2 — Design Spec

**Date:** 2026-04-23
**Owner:** Steven Swan (sactoswan@gmail.com)
**Status:** Draft pending user review
**Companion:** `docs/architecture-v2.html` (infographic)

---

## 1 · Goals

A multi-channel AI operations layer across Steven's 8 LLCs that feels like the "claudeclaw" command center from the `rVzGu5OYYS0` YouTube build, implemented entirely on Anthropic's Managed Agents API (no local Claude Code SDK, no third-party harnesses), deployed on Vercel/Next.js, with an Obsidian vault as durable memory and a Supabase Postgres as hot memory.

**Primary outcomes:**

- Replace the remote-CC use cases that OpenClaw and Paperclip covered, so they can be uninstalled.
- Collapse the current 48-agent company-first roster into 6 shared "department" agents. Cross-company knowledge sharing is an explicit feature.
- Make the Research agent demonstrably smarter over time by wiring it to NotebookLM + YouTube + the Obsidian vault.
- Enable agents to juggle concurrent tasks across companies and projects without context bleed.
- Enable agents to self-extend — spawn sub-agents, install curated skills, and (Phase 3) author net-new tool code via PR — with a complete audit trail and a promotion path from ephemeral to permanent.
- Reach Steven on any channel he prefers: dashboard, Telegram, Slack, email, voice.

## 2 · Non-goals

- Multi-tenant. Personal tool. No user mgmt beyond Steven.
- OpenClaw, Paperclip, or any other third-party CC harness.
- Local Agent SDK runtime. Managed Agents only.
- Per-company agent silos.
- Pika / avatar-based voice experiences (deferred as "eyewateringly expensive").
- iMessage / SMS (abandoned in favor of Telegram for cost and stability).
- Agent-authored code running in production without a human-approved PR in the loop.

## 3 · High-level architecture

Six layers, top to bottom:

1. **Channels** — Dashboard (Phase 1), Telegram (P1), Slack (P2), Email (P2), Voice (P3).
2. **Gateway** — Auth + per-channel allow-lists, queue with concurrency limits, rules-first router with Triage fallback.
3. **Agents** — Seven department agents (Main/Haiku, Research/Sonnet, Comms/Sonnet, Content/Sonnet, Ops/Sonnet, Legal/Opus, Dev/Opus).
4. **Memory** — Hot store in Supabase (queue, tasks, hive-mind, insights, registries). Durable store in the `staffbotsteve/swan-vault` Obsidian repo (pinned memories, briefs, Research knowledge, session summaries). Weekly cron promotes hot → durable.
5. **Tool fabric** — Hosted on Vercel as Next.js API routes, registered as Managed-Agents tool definitions: NotebookLM wrapper, YouTube search, vault read/write, Gemini Flash classifier, outbound dispatch, image gen, `spawn_subagent`, `skill_manager`.
6. **Registry & promotion** — Supabase tables that audit every spawn / activation / PR, with a dashboard surface for reviewing candidates and promoting ephemeral entities to permanent roster or standard skills.

## 4 · Agents

All seven share the same system-prompt skeleton plus a role-specific block. Each agent's system prompt is regenerated on deploy from a Markdown template in `src/agents/<role>.md`.

| Role     | Model     | Concurrency | Hero tools                                                        |
| -------- | --------- | ----------- | ----------------------------------------------------------------- |
| Main     | Haiku     | 10          | dispatch, spawn_subagent, hive_query                              |
| Research | Sonnet    | 8           | **NotebookLM**, **YouTube**, vault_read/write, web_search, spawn  |
| Comms    | Sonnet    | 6           | gmail, calendar, dispatch, vault_read                             |
| Content  | Sonnet    | 4           | image_gen, linkedin, youtube_pub, vault_read                      |
| Ops      | Sonnet    | 6           | vault_read/write, stripe_read, quickbooks, spawn_subagent         |
| Legal    | Opus      | 3           | vault_read, doc_parse, web_search                                 |
| Dev      | Opus      | 4           | github, vault_read/write, web_search, shell, spawn_subagent       |

Every agent can call `spawn_subagent`, `activate_skill`, `propose_skill`, `hive_query`, `dispatch`, and `vault_read/write` unless explicitly excluded.

Each agent's permanent-vs-ephemeral status lives in `agent_registry`. The seven above are seeded as `status='permanent'`.

**Dev** was added after the initial design review (2026-04-23 session) once the "who handles coding?" gap surfaced. Dev is explicitly scoped to **async** engineering work (PR review, deploy/CI triage, one-shot fixes from Telegram, writing specs/plans) — it does *not* replace Claude Code in Steven's IDE. Dev has no direct push/merge permission, no production-system writes, no Stripe/QuickBooks access. QA and testing fall under Dev (via `browse`, `/qa`, and `/design-review`-style skills invoked as tools). See `src/agents/dev.md`.

## 5 · Channels

Per-channel auth, webhook handlers, and outbound dispatch paths:

- **Dashboard** — NextAuth with Google OAuth locked to `sactoswan@gmail.com`. All write routes behind session.
- **Telegram** — Bot webhook at `/api/channels/telegram`. Allow-list env var `TELEGRAM_ALLOWED_CHAT_IDS`. On new message → enqueue → router. Outbound via `dispatch('telegram', chatId, text)`.
- **Slack** — Slack app with Events API. Webhook at `/api/channels/slack`. Allow-list: user ID. Channel-ID → preferred agent mapping lives in `channel_routing` Supabase table (e.g. `#research → Research`).
- **Email** — Resend or Postmark inbound webhook at `/api/channels/email`. Sender allow-list: a few of Steven's addresses. Thread ID preserved so replies land in the same chain.
- **Voice** — Pipecat server on Fly.io with WebSocket to browser. Gemini Live for STT/TTS. Room creation via dashboard, access gated by PIN stored hashed in Supabase.

## 6 · Gateway

### Auth

- NextAuth with Google provider, `allowedEmails = [sactoswan@gmail.com]`.
- Every API route wraps `requireAuth()` that returns 401 unless the session email matches.
- Channel webhooks validate their own signatures (Telegram secret token, Slack signing secret, Resend webhook signature) plus their allow-lists.

### Queue

- Postgres-backed via Supabase. A `task_queue` table with advisory locks per agent.
- Concurrency: soft cap per agent (see table above). Excess tasks sit in `queued` until in-flight drops below cap.
- Prevents cron-vs-human collisions by processing one message per agent at a time for a given conversation.

### Router (rules-first)

- `app/src/routing/index.ts` applies rules in this order:
  1. Explicit agent mention: `@research ...` or `/dispatch research ...`
  2. Slash commands: `/research`, `/ops`, `/legal`, `/main`, etc.
  3. Channel hint: `channel_routing` table lookup (Slack channel → agent).
  4. Sender hint: certain email senders default to certain agents.
  5. Fallback: send the message to Main (Triage/Haiku). Main calls `delegate(agent, task)` which spawns a downstream session.

### Project + company inference

- On task creation, a lightweight Gemini-Flash call infers `(project, company)` from the message content if not explicit.
- Ambiguous → Main asks Steven for clarification via the source channel.

## 7 · Memory

### Hot — Supabase Postgres

Schemas live in `supabase/migrations/`:

```sql
-- Tasks (hive-mind)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  parent_task_id uuid references tasks(id),
  channel text,
  source_id text,
  project text,
  company text,
  priority int default 50,
  status text check (status in ('queued','in_flight','awaiting_user','done','failed','archived')),
  system_prompt_hash text,
  session_id text,
  input jsonb,
  output jsonb,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,4),
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index on tasks (agent_id, status);
create index on tasks (company, project, status);
create index on tasks (created_at desc);

-- Memory: pinned / insights / decaying
create table memories (
  id uuid primary key default gen_random_uuid(),
  kind text check (kind in ('fact','preference','context','pinned')),
  body text not null,
  tags text[],
  company text,
  project text,
  importance numeric default 0.5,
  ttl_days int,
  source_task_id uuid references tasks(id),
  promoted_to_vault_at timestamptz,
  vault_path text,
  created_at timestamptz default now(),
  last_used_at timestamptz
);
create index on memories (kind, importance desc);

-- Registries
create table agent_registry (
  id text primary key,               -- matches Managed-Agents agent_id
  role text,                          -- research, ops, ...
  display_name text,
  model text,
  system_prompt_template text,
  status text check (status in ('permanent','ephemeral','awaiting_promotion','archived')),
  parent_agent_id text,
  creator_task_id uuid references tasks(id),
  created_at timestamptz default now(),
  promoted_at timestamptz,
  archived_at timestamptz
);

create table skill_registry (
  name text primary key,
  description text,
  source text check (source in ('builtin','curated','agent_authored')),
  status text check (status in ('experimental','standard','pr_pending','archived')),
  tool_definition jsonb,
  code_ref text,                      -- git SHA for agent-authored
  pr_url text,
  author_agent_id text,
  install_count int default 0,
  success_count int default 0,
  failure_count int default 0,
  daily_spend_cap_usd numeric,
  created_at timestamptz default now(),
  promoted_at timestamptz
);

create table spawn_log (
  id uuid primary key default gen_random_uuid(),
  parent_agent_id text,
  child_agent_id text references agent_registry(id),
  reason text,
  task_id uuid references tasks(id),
  ttl_seconds int,
  created_at timestamptz default now(),
  terminated_at timestamptz,
  outcome text                        -- 'success', 'timeout', 'error', 'promoted'
);

create table install_log (
  id uuid primary key default gen_random_uuid(),
  skill_name text references skill_registry(name),
  agent_id text,
  triggered_by_task_id uuid references tasks(id),
  action text check (action in ('activate','deactivate','propose','pr_opened','pr_approved','pr_merged','archive')),
  notes text,
  created_at timestamptz default now()
);

-- Routing hints
create table channel_routing (
  channel text,
  external_id text,
  agent_role text,
  primary key (channel, external_id)
);
```

### Durable — Obsidian vault

`staffbotsteve/swan-vault`, already wired via `src/lib/vault.ts`. Paths:

- `00-Inbox/` — ephemeral drop zone (unchanged).
- `01-Projects/<project>/CONTEXT.md` — project briefs (unchanged).
- `02-Areas/Assistant/config.json` — existing assistant config (unchanged).
- `02-Areas/Memory/Pinned.md` — new. Pinned memories promoted from Postgres.
- `02-Areas/Memory/Insights/YYYY-MM.md` — new. Monthly rollup of high-importance insights.
- `02-Areas/Research/<topic>.md` — new. Research agent's durable knowledge by topic.
- `03-Sessions/Code/…`, `03-Sessions/Cowork/…`, `03-Sessions/Managed-Agents/…` — session summaries (unchanged, extended).

### Vault promotion cron

A daily Vercel cron at `/api/cron/vault-promote`:

1. Selects memories with `importance >= 0.7`, `kind in ('fact','pinned','context')`, `promoted_to_vault_at IS NULL`.
2. Groups by `(company, project)` and writes markdown to the appropriate vault file via the GitHub Contents API.
3. Stamps `promoted_to_vault_at` on each row.

## 8 · Tool fabric

Every tool is a Next.js API route under `app/src/app/api/tools/<tool>/route.ts` that Managed Agents can call via tool-use. Each tool is also registered via `/v1/tools` with a JSON schema that matches the route's input/output.

**Phase 1 tools:**

- `notebooklm.*` — `list_notebooks`, `create_notebook`, `add_source_url`, `query`, `generate_report`, `generate_infographic`, `generate_slide_deck`. Wraps NotebookLM-py. OAuth tokens stored encrypted in Supabase.
- `youtube.search` — yt-dlp wrapper. Inputs: `query`, `max_results`. Outputs: list of `{title, channel, url, transcript}`.
- `vault.read_file`, `vault.list_dir`, `vault.write_file` — thin wrappers over existing `src/lib/vault.ts`.
- `web.search` — thin wrapper over an existing search provider (Brave or SerpAPI).
- `dispatch` — unified outbound. Input: `{channel, recipient, text, attachments}`. Routes to Telegram / Slack / email / future channels.
- `hive.query` — read-only query against `tasks` and `memories`. Supports filters by agent, company, project, status.
- `classify` — wraps Gemini 2.5 Flash for classification tasks (fact / preference / context / routing).
- `image.generate` — nano-banana / Imagen.
- `spawn_subagent` — creates an ephemeral agent via Managed Agents API, logs to `spawn_log` and `agent_registry`, returns `agent_id`. Enforces depth ≤ 2, per-parent concurrency ≤ 3, 30-min TTL. Returns early-terminated sub-agents with a reason code.
- `skill.activate`, `skill.list`, `skill.propose` — Phase 2. Curated registry operations. `propose` drops a row into `skill_registry` with `status='pr_pending'` and notifies Steven.

**Phase 3 tools:**

- `skill.author_pr` — drafts TypeScript for a new tool route, opens a PR against the command-center repo via the GitHub API, sets preview deploy, reports the URL. Human approval remains required to merge.

## 9 · Registry and promotion

### Spawn lifecycle

1. Parent calls `spawn_subagent({ role, instructions, ttl_seconds, reason })`.
2. Tool creates a Managed Agents agent with the given instructions, inherits parent's tools minus `spawn_subagent` (no recursion past depth 2).
3. Row inserted in `agent_registry` with `status='ephemeral'` and `spawn_log` with the reason.
4. Sub-agent works, posts results back via `hive.query`-readable task rows.
5. On TTL expiry or explicit termination, `terminated_at` stamped. Tombstoned sub-agent is not deleted but left archived so history persists.

### Promotion candidates

Weekly job `/api/cron/promotion-candidates`:

- Groups `spawn_log` rows by `(parent_agent_id, role-name-derived-from-instructions)`.
- If a group has ≥ 5 successful outcomes, last 30 days, success rate ≥ 80% → insert or update row in `promotion_candidates` view, status `awaiting_promotion`.
- Same logic for skills in `skill_registry` — experimental → standard after 10 successful invocations with ≥ 90% success rate.

### Dashboard registry page (`/registry`)

Four tabs:

1. **Agents** — table of all rows in `agent_registry` filtered by status. One-click actions: **promote**, **extend TTL**, **archive**, **view spawn history**.
2. **Skills** — table of all rows in `skill_registry`. One-click actions: **promote to standard**, **archive**, **review PR** (opens GitHub), **pause**, **test run**.
3. **Plugins** — same structure for plugin-type skills.
4. **Audit log** — chronological union of `spawn_log` + `install_log`. Filter by agent, skill, date range.

### Guardrails (always on)

- Recursion depth ≤ 2 for sub-agents.
- Per-parent concurrent sub-agent cap = 3.
- Per-sub-agent TTL default = 30 min, max = 2 h.
- Per-agent daily token budget. Over budget → queue instead of dispatch; notify via Telegram.
- Per-skill daily spend cap (configured at install time).
- Experimental skills sandboxed: Vercel preview deploy only, rate-limited, no production traffic, no vault writes, no outbound dispatch unless explicitly granted.
- Every agent-authored PR requires Steven's click to merge. No auto-merge ever.

## 10 · Security

- Google SSO locks the dashboard.
- Per-channel allow-lists enforced at webhook layer.
- Voice PIN stored hashed (bcrypt) in Supabase, rotated via dashboard.
- All secrets in Vercel env vars. Nothing in repo.
- Every tool route logs `agent_id`, `task_id`, input summary, cost.
- Rate limits per channel per sender (50 messages / 15 min default).
- No tool can call another Next.js internal route except through the tool fabric — no sideways calls.

## 11 · Phasing with acceptance criteria

### Phase 1 — Foundation + core loop

Acceptance criteria (each is a shippable line item):

- Google SSO gates the dashboard. Non-`sactoswan@gmail.com` sessions get 403.
- All 48 legacy Managed Agents archived; 6 new permanent agents created via API with proper templates.
- Supabase schemas applied. `tasks`, `memories`, `agent_registry`, `skill_registry`, `spawn_log`, `install_log`, `channel_routing` exist with correct indexes.
- Dashboard pages: `/` (roster + dispatch + hive-mind board), `/memory`, `/registry`, `/assistant` (existing).
- Router correctly routes explicit `@research` / slash / channel hints. Ambiguous messages go to Main.
- Telegram bridge: sending a message to the bot from Steven's allow-listed chat ID triggers a task, agent reply comes back in Telegram.
- NotebookLM wrapper: OAuth flow works end-to-end, `list_notebooks` + `add_source_url` + `query` + `generate_report` all callable as tools by Research.
- YouTube tool: `youtube.search("topic")` returns transcripts.
- Vault promotion cron runs daily and writes at least one markdown file on a test memory.
- Multi-task: Research can work on two tasks tagged to different companies/projects concurrently without context bleed.

### Phase 2 — Channels + curated self-extension

- Slack bot installed in workspace, Events API webhook routes to router.
- Email inbound via Resend works; thread IDs preserved.
- `dispatch` tool routes outbound to any of Telegram / Slack / Email.
- `spawn_subagent` tool functional with full audit trail. TTL expiry terminates cleanly.
- `skill.activate` / `skill.propose` work against `skill_registry`.
- Registry dashboard tabs live. Promoting a sub-agent via one-click transitions `agent_registry.status` correctly and re-templates the agent.

### Phase 3 — Voice + freeform skill authoring

- Pipecat server running on Fly.io. Browser voice room works end-to-end with Gemini Live.
- PIN gate enforced at WebSocket upgrade.
- `skill.author_pr` generates tool code, opens a PR, triggers Vercel preview.
- Merging a PR and marking `skill_registry.status='experimental'` makes the new tool usable immediately; it cannot write to vault or dispatch externally.
- Successful usage graduates tool to `standard` via promotion cron.

## 12 · Open questions

- **NotebookLM OAuth identity.** Whose Google account does NotebookLM authenticate as — `sactoswan@gmail.com` or a dedicated workspace identity? Default: `sactoswan@gmail.com` unless Steven specifies otherwise.
- **Gemini key provisioning.** Flash classifier needs an API key. Default: put it in Vercel env vars (`GOOGLE_AI_API_KEY`).
- **Pipecat cost.** Fly.io estimate is ~$10/mo; if voice usage grows we may need to move to Railway or a cheap VPS.
- **Spend caps.** What daily Anthropic spend should trip a brake? Default: warn at $50/day, hard pause at $150/day, Steven-overridable.

## 13 · Risks

- **Managed Agents API beta moves.** The beta header `agent-api-2026-03-01` is pinned; any API change requires updating `src/lib/anthropic.ts`.
- **Sub-agent sprawl.** Even with caps, a runaway spawn pattern could create dozens of archived agents cluttering the registry. Mitigation: the registry page has "hide archived" by default and a nightly GC of agents archived > 90 days.
- **Freeform skill authoring (Phase 3).** Agent-written TypeScript could have subtle bugs or prompt-injection paths. Mitigation: preview-only execution, spend caps, Steven-only merge, automatic revert on high-failure-rate.
- **Vault merge conflicts.** If the promotion cron and Steven's manual edits touch the same file, we could lose content. Mitigation: cron uses GitHub Contents API with SHA checks; on conflict, append to a new file with timestamp suffix and log for manual reconciliation.

---

*Next step after user review: invoke the `superpowers:writing-plans` skill to produce the implementation plan for Phase 1.*
