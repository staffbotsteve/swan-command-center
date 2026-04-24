# Swan Command Center — Worker

Long-lived Node process that drains the Supabase task queue and runs
Claude Agent SDK turns against Steven's Claude Code subscription.

## Why it exists

Agent inference runs here (not on Vercel). Vercel keeps handling
channel webhooks, auth, dashboard UI, cron jobs, and hosted tool
routes. Tasks flow:

```
Telegram / Dashboard / Slack / Email
        ↓
Vercel (/api/channels/*, /api/dispatch) — writes a row to `tasks`
        ↓
Worker (this) — claims row, runs SDK.query(), writes result + tokens
        ↓
Worker — dispatches reply back via the right channel
```

## Authentication

The SDK reads your Claude Code OAuth tokens from `~/.claude/`. No
`ANTHROPIC_API_KEY` needed; inference costs your Max-tier subscription
quota (not per-token API credits). If you need to rotate:

```
claude logout
claude login
```

## Running locally (scenario A: Steven's Mac laptop)

```
cd /Users/stevenswan/project-folders/swan-command-center/app
npm run worker
```

The worker polls every 1s by default. Stop with Ctrl-C — graceful
shutdown drains in-flight tasks before exit.

### Keeping it running via LaunchAgent

The canonical plist lives at `worker/com.swan.command-worker.plist`.
It's hardcoded for Steven's nvm-managed Node at
`/Users/stevenswan/.nvm/versions/node/v24.15.0/bin/node`. If you upgrade
Node, update that path in both the repo file and
`~/Library/LaunchAgents/com.swan.command-worker.plist`.

Install:

```
cp worker/com.swan.command-worker.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.swan.command-worker.plist
```

Admin commands:

```
# status (shows PID and last exit code)
launchctl list | grep swan

# stop (unload)
launchctl unload ~/Library/LaunchAgents/com.swan.command-worker.plist

# start (reload)
launchctl load -w ~/Library/LaunchAgents/com.swan.command-worker.plist

# restart (unload + load)
launchctl unload ~/Library/LaunchAgents/com.swan.command-worker.plist && \
  launchctl load -w ~/Library/LaunchAgents/com.swan.command-worker.plist

# live log tail
tail -f ~/Library/Logs/swan-command-worker.log

# errors only
tail -f ~/Library/Logs/swan-command-worker.err.log
```

The laptop still sleeps and the worker still stops during sleep — that's
scenario A's inherent limitation. Messages to Telegram sit queued in
Supabase until the worker wakes up.

**Current role allow-list:** the installed plist has
`WORKER_ENABLED_ROLES=main` for a safe rollout. To flip all 7 roles
onto the worker path, edit the plist (remove the env var or set to
`main,research,comms,content,ops,legal,dev`), copy to
`~/Library/LaunchAgents/`, and restart via the commands above.

## Moving to scenario B (laptop + small always-on VPS)

Same code, different host. On a Hetzner CX11 / Fly.io 256MB VM:

1. Install Node 20+ and a Claude Code CLI on the VM.
2. `claude login` — authenticate once (the tokens live in the VM's `~/.claude/`).
3. Clone this repo, `npm install`.
4. Set env vars:

```
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export CMD_CENTER_BASE_URL=https://swan-command-center.vercel.app
export WORKER_SECRET=...
```

5. `npm run worker`, wrap in systemd / supervisord / a Fly.io process
   group for restart-on-crash.

Both the laptop worker and the VPS worker can run concurrently — the
`for update skip locked` claim logic in Postgres ensures no double-processing.
You can turn the laptop worker off when you're away.

**Cost-transparency note for B:**
- VPS host: ~$5/mo (Hetzner CX11) or ~$3/mo (Fly.io 256MB + Postgres-native network).
- No additional Anthropic cost — the VM uses the same Max-tier subscription
  once its `~/.claude/` is authenticated. The subscription is per-account,
  not per-device, so multi-device sharing is an Anthropic product decision
  (usually fine for single-owner accounts, but verify before you scale).

## Moving to scenario C (dedicated cloud Mac)

Same code again. Deploy to Mac Stadium / MacinCloud / a rented Mac mini.

**Cost-transparency note for C:** ~$30–80/mo for the host. Only worth it
if A and B both fall short (e.g., you're running this for a small team
and need true 99.9% uptime).

## Environment

All required unless noted:

| Name                         | Purpose                                         |
|------------------------------|-------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`   | Task queue host                                 |
| `SUPABASE_SERVICE_ROLE_KEY`  | Queue + registry writes                         |
| `CMD_CENTER_BASE_URL`        | `https://swan-command-center.vercel.app`        |
| `WORKER_SECRET`              | Bearer the worker sends to /api/tools/[name]    |
| `TELEGRAM_BOT_TOKEN`         | Outbound Telegram send (can also be on Vercel)  |
| `GITHUB_PAT`                 | Needed by vault tools if run locally in worker  |
| `WORKER_POLL_INTERVAL_MS`    | Optional. Default 1000.                         |
| `WORKER_MAX_CONCURRENCY`     | Optional. Default 3.                            |
| `WORKER_ENABLED_ROLES`       | Optional. Comma-separated allow-list.           |

`ANTHROPIC_API_KEY` is **intentionally not in this list.** The SDK
uses CC OAuth. If the env var is set, the SDK will prefer it — so
**unset it before running the worker** to guarantee you're on the
subscription path.

## Phase C.1 scope

This checkpoint:

- Worker skeleton (claim, run turn, write result, reply) — this file.
- Only `main` role by default (set `WORKER_ENABLED_ROLES=main`).
- No MCP tool registrations yet — Phase C.2.
- Vercel Telegram webhook still runs `runTurn` inline as a fallback.
  Set `WORKER_ENABLED_ROLES=main` to shift main-routed messages to the
  worker; leave the other 6 on Managed Agents until Phase C.2.

## Phase C.2 will add

- Local MCP tool registrations (vault, web search, classify, dispatch,
  hive query) calling Vercel with `WORKER_SECRET`.
- All 7 roles on the worker path.
- Channel handlers stop calling `runTurn` — enqueue only.

## Phase C.3 will remove

- `src/lib/anthropic.ts`'s `runTurn` + all Managed Agents API wrapper code.
- The 7 Managed Agents on Anthropic stay registered as disaster recovery.
