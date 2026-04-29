# NotebookLM companion (Mac-local, Python venv)

Wraps [`notebooklm-py`](https://github.com/teng-lin/notebooklm-py)
so the worker on this Mac can query the user's NotebookLM account
through three in-process MCP tools:

- `notebooklm.list_notebooks`
- `notebooklm.search`
- `notebooklm.ask`

## Setup (one-time)

```bash
brew install python@3.12
cd /Users/stevenswan/project-folders/swan-command-center/app/companion/notebooklm
/usr/local/bin/python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/notebooklm login    # browser popup; sign in with sactoswan@gmail.com
.venv/bin/notebooklm list     # sanity check
```

The session persists at `~/.notebooklm/storage_state.json`. If it
ever expires, just rerun `notebooklm login`.

## Wiring

The worker (`worker/tools.ts`) imports
`src/tools/notebooklm.ts`, which shells out to `.venv/bin/notebooklm
<subcommand> --json`. No HTTP server, no Fly deploy, no LaunchAgent
for this — it's a per-call subprocess.

Override the CLI path with `NOTEBOOKLM_CLI=…` env var if needed.

## Historical notes

`app.py`, `Dockerfile`, `fly.toml` in this directory are leftovers
from a deprecated approach that built a hand-rolled HTTP companion
calibrated against captured NotebookLM HARs. That approach hit
constant cookie-rotation pain when deployed to Fly. Kept on disk as
documented Path A.
