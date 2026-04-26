# Option C — Local Claude Agent SDK runtime

**Date:** 2026-04-24
**Status:** Draft (design in progress)
**Supersedes (runtime layer only):** Managed Agents API flow from `2026-04-23-command-center-v2-design.md`
**Keeps:** everything else — Supabase schema, Obsidian vault, router, tool fabric, dashboard, channel webhooks

## Why this exists

Phase 1 is on the Managed Agents beta. First real round-trip showed two problems:

- **Cost per turn:** ~$0.008 (Haiku) to ~$0.12 (Opus). At 100 mixed turns/day, ~$60/month. At 500/day, would saturate the $150 daily hard cap.
- **Latency per turn:** 92s observed for a trivial "say OK" Main turn — the session polling loop plus server-side scheduling overhead, not model inference.
- **No caching exposed:** API doesn't accept `cache_control`; `cache_read_input_tokens` stays 0 across identical calls.

SDK probe on 2026-04-24 verified the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk@0.2.119`) runs against Steven's existing Max-tier Claude Code subscription via OAuth tokens in `~/.claude/` — no `ANTHROPIC_API_KEY` needed, no per-token billing, and a 7× latency improvement (13.7s for the same call).

## Goal

Replace the agent inference runtime with the SDK, driven from a long-lived worker process that consumes tasks from the existing Supabase queue. Keep everything else unchanged.

## Non-goals

- Revisiting the 7-department roster, the channel lineup, memory architecture, or registry design. Those stayed right; only the runtime moves.
- Abandoning Managed Agents *forever*. We'll leave the existing Vercel dispatch + Telegram route code path alive as a fallback (`RUNTIME=managed` vs `RUNTIME=sdk`) so we can A/B test.
- Supporting third-party harnesses. This is first-party code using the official SDK, which keeps us compliant with Anthropic's April 4 ToS update.

## Portability goal (A → B → C)

Build the worker so it runs the same code in three deployment scenarios. The *choice* of machine is a config/ops decision, not an architecture change.

- **A. Steven's laptop (current)** — `npm run worker` in a tmux session or as a LaunchAgent. Sleeps when the laptop sleeps; queue accumulates; worker drains when it wakes. Fine for solo use, not 24/7.
- **B. Laptop + tiny always-on host** — same worker code on a $5/mo Hetzner/Fly/Railway VM. Laptop worker can run concurrently or shut down; both workers claim rows atomically from the same Supabase queue.
- **C. Dedicated Mac (Mac mini at home, Mac Stadium, or similar)** — same worker code, same deploy command. Only the host changes.

## Architecture

```
┌────────────────────┐     ┌────────────────────┐     ┌───────────────────────┐
│  iPhone Telegram   │────▶│ Vercel             │     │  Worker (laptop/VPS)  │
│  Dashboard browser │     │                    │     │                       │
└────────────────────┘     │  /api/channels/*   │     │  1. drain queue       │
                           │  /api/dispatch     │     │     (SELECT ... FOR   │
                           │  /api/auth (SSO)   │     │      UPDATE SKIP      │
                           │  /api/tools/[name] │◀────│      LOCKED)          │
                           │  /api/cron/*       │     │  2. map role -> agent │
                           │                    │     │  3. SDK query()       │
                           │  (inserts task     │     │     - CC OAuth auth   │
                           │   rows)            │────▶│     - local MCP tools │
                           └────────────────────┘     │  4. write result +    │
                                   │                  │     tokens + cost     │
                                   ▼                  │     to tasks row      │
                           ┌────────────────────┐     │  5. dispatch reply    │
                           │  Supabase          │◀────│     via channel API   │
                           │  tasks (queue)     │     └───────────────────────┘
                           │  memories          │
                           │  agent_registry    │
                           │  hive task log     │
                           └────────────────────┘
```

## What changes in code

### Vercel side — minimal

- `/api/channels/telegram/route.ts`: **stop running the turn inline.** After `ingest()` writes the task row, return 200 immediately. The worker handles it.
- `/api/dispatch/route.ts`: same — return `{ task_id, status: "queued" }`. Dashboard polls `/api/hive?task_id=...` to surface the result when it lands.
- `/api/tools/[name]/route.ts`: add a `WORKER_SECRET` bearer check so the worker can call hosted tools without an SSO session. Public for worker, protected for everyone else.

### New code

- `src/lib/agents-config.ts` — loads `src/agents/*.md` and maps role → SDK `AgentDefinition` (name, prompt, tools, model).
- `src/lib/pricing.ts` — **no change needed** but we add a `subscriptionConsumption` column on tasks so we can track CC quota rather than dollars.
- `worker/` — new directory at repo root:
  - `worker/index.ts` — main loop: drain → run → write. Graceful SIGTERM shutdown.
  - `worker/run-turn.ts` — SDK wrapper that takes a task row and returns `{text, usage, error}`.
  - `worker/tools.ts` — local MCP tool registrations (vault, web search, classify, dispatch, hive query, etc.) that call Vercel's `/api/tools/[name]` with `WORKER_SECRET`.
  - `worker/README.md` — portability runbook: how to start on A, how to deploy to B's VPS, how to deploy to C's Mac.
- `scripts/worker.mjs` — shim that makes `npm run worker` work.

### What we keep and why

- **Supabase schema:** unchanged. `tasks`, `memories`, `agent_registry` all still right.
- **Router module:** unchanged. Still decides which role handles a message.
- **Agent system prompts (`src/agents/*.md`):** unchanged. They're the source of truth for the SDK's `agent.prompt`.
- **Channel webhooks:** unchanged shape. They just stop invoking agents inline.
- **Dashboard pages:** unchanged. Hive board already shows real-time task state.
- **Vault promotion cron:** unchanged.
- **7 permanent Managed Agents on Anthropic:** kept as archived fallback. Not deleted. If Option C ever fails catastrophically, we flip `RUNTIME=managed` and they come back online.

## Auth model for the worker→Vercel tool calls

Worker sends `Authorization: Bearer ${WORKER_SECRET}` on every `/api/tools/[name]` call. The route checks this before the SSO gate. `WORKER_SECRET` is a 64-char hex string (same pattern as `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`). Lives in Vercel env vars + worker's `.env`.

Public prefixes in `src/proxy.ts` grow by one entry (`/api/tools`), guarded by the bearer check inside the route.

## Claim semantics

To keep the queue safe for multiple concurrent workers (scenario B):

```sql
-- Claim the oldest queued task, atomically.
update tasks
set status = 'in_flight', started_at = now()
where id = (
  select id from tasks
  where status = 'queued'
  order by priority desc, created_at asc
  for update skip locked
  limit 1
)
returning *;
```

`SKIP LOCKED` means two workers polling simultaneously never double-claim a row. Postgres handles it.

Worker polls every 1 second by default (`WORKER_POLL_INTERVAL_MS`). Lower = more responsive, more load on Supabase. 1s is a reasonable default.

## Cost-transparency view

| Scenario | Flat cost | Per-turn marginal | Rate ceiling |
|---|---|---|---|
| **Current (Managed Agents)** | $0 | $0.008–$0.12 / turn | `$150/day` (our cap) |
| **Option C on A (laptop)** | $0 extra (Max sub already paid) | $0 | Anthropic Max 5x rate limit (~225 msgs/5hr/session, higher total) |
| **Option C on B (laptop + $5 VPS)** | $5/mo | $0 | Same Max rate limit |
| **Option C on C (Mac mini rent / Mac Stadium)** | $30–80/mo | $0 | Same Max rate limit |

If usage is genuinely heavy, the ceiling shifts from "dollars per day" to "requests per session window" — a different failure mode to design around. For single-user usage (Steven alone), both are effectively unlimited.

## Phasing

- **Phase C.1 — Worker skeleton + one role.** Build `worker/` infra, wire Main (Haiku, simplest prompt, lowest stakes) through the new path. Leave the other 6 roles on Managed Agents. Verify a Telegram round-trip.
- **Phase C.2 — Cut over remaining 6 roles.** Flip Research/Comms/Content/Ops/Legal/Dev to the SDK path. Monitor for 48h.
- **Phase C.3 — Remove the Managed Agents code path.** Delete `runTurn` and the old Anthropic client, keep the archived Managed Agents for disaster recovery.

Each phase ships independently. If Phase C.1 reveals a blocker we can't work around, we stay on Managed Agents with the cost-tuning levers already in place and revisit later.

## Open questions

- **Subscription metering visibility:** the SDK's `total_cost_usd` field reports API-equivalent pricing, not real subscription consumption. We need a different telemetry approach to watch quota burn — probably a counter in `memories` or a dedicated `subscription_usage` table. Defer to Phase C.2.
- **Tool parity:** the SDK's built-in tools (Read/Grep/Bash/etc.) overlap some of ours (vault_read, web_search). Decide whether to expose both and let agent prompts pick, or disable built-ins to force our HTTP tools. My lean: disable built-ins except for a narrow set; force everything through our tool fabric so logging + memory are consistent.
- **Worker LaunchAgent setup:** for scenario A to actually run 24/7 on Steven's laptop, we need a `launchctl` plist or equivalent. Defer to Phase C.1 runbook.

---

**Next step:** Phase C.1 implementation in this branch (`refactor/option-c-local-sdk`).
