# NotebookLM Companion

Python FastAPI service that lets the worker talk to NotebookLM via your
authenticated browser session. **Unofficial integration — see the
risk disclosure below before deploying.**

## What it does

Wraps NotebookLM's internal web endpoints behind a clean HTTP API the
TypeScript worker can call. Five operations:

```
GET    /notebooks              → list your notebooks
POST   /notebooks              → create a new notebook
POST   /sources                → add a URL as a source to a notebook
POST   /query                  → chat-with-notebook (ask a question)
POST   /reports                → generate a report (briefing / deep_dive / slide_deck)
```

Plus `GET /health` (no auth) for liveness checks.

## Risk disclosure

- **No official Google API.** The web endpoints we hit are internal
  and undocumented. They will break when Google ships changes.
- **Authenticates as YOU via cookie scraping.** The service holds
  your Google session cookies. Google can flag this as bot activity
  and lock the account temporarily (rare for low-volume personal use,
  but possible).
- **No ToS exemption.** Personal use isn't explicitly forbidden, but
  it isn't blessed either. Gray zone.

If any of this is too much risk for your primary Google account, kill
this service and fall back to the Drive-based research workflow
(Research deposits findings in `Drive/Research/<topic>/`, you drag
the folder into NotebookLM manually for audio overviews).

## One-time setup

### 1. Install Fly CLI

```
brew install flyctl
fly auth login
```

### 2. Create the app

```
cd companion/notebooklm
fly launch --no-deploy --copy-config --name swan-notebooklm
fly volumes create notebooklm_data --region sjc --size 1
```

The `notebooklm_data` volume is where `cookies.txt` lives. 1 GB is
absurdly more than needed but the smallest Fly offers.

### 3. Set the shared secret

```
fly secrets set SHARED_SECRET=$(openssl rand -hex 32)
```

Save the output — you'll need it for the worker too. This is the
bearer the worker sends on every request.

### 4. Export your Google cookies

NotebookLM authenticates via your normal Google session cookies.
Easiest path:

1. Open Chrome, sign in to NotebookLM at https://notebooklm.google.com
2. Install the Chrome extension **"Get cookies.txt LOCALLY"**
   (https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc).
   Open-source, exports cookies in Netscape format.
3. While on `notebooklm.google.com`, click the extension icon → click
   "Export". You get a `cookies.txt` file.
4. Repeat for `accounts.google.com` (same auth backbone) — append
   those cookies to the same file, or export separately and concatenate.

### 5. Upload cookies to the Fly volume

```
fly ssh sftp shell
> put cookies.txt /secrets/cookies.txt
> quit
```

Alternative: use a one-shot machine to write the file:

```
fly ssh console -C 'mkdir -p /secrets'
cat cookies.txt | fly ssh console -C 'cat > /secrets/cookies.txt'
```

### 6. Deploy

```
fly deploy
```

### 7. Verify health

```
curl https://swan-notebooklm.fly.dev/health
# expect: {"ok":true,"cookies_loadable":true,"cookie_count":12}
```

If `cookies_loadable: false`, your cookies file isn't where the app
expects it. Check the volume mount.

### 8. Wire to the worker

In your local `.env.local`:

```
NOTEBOOKLM_SERVICE_URL=https://swan-notebooklm.fly.dev
NOTEBOOKLM_SHARED_SECRET=<the same hex string from step 3>
```

Restart the LaunchAgent worker:

```
launchctl unload ~/Library/LaunchAgents/com.swan.command-worker.plist
launchctl load -w ~/Library/LaunchAgents/com.swan.command-worker.plist
```

## Filling in the real endpoints

The first deploy will return **501 Not Implemented** for every
notebook operation. That's because the actual NotebookLM internal
endpoints are guesses — confirming them requires inspecting your
browser's Network tab.

For each operation, repeat this loop:

1. Open NotebookLM in Chrome, open DevTools (`Cmd+Opt+I`), go to
   **Network** tab, filter to `XHR/Fetch`.
2. Perform the action manually in the UI (e.g., create a notebook,
   add a URL source, ask a question).
3. Find the request that fired. Copy:
   - URL path
   - HTTP method
   - Request payload (JSON or form-encoded)
   - Any custom headers (`X-Goog-...`)
4. Paste the URL, method, and payload shape into a comment on the
   matching handler in `app.py`.
5. I'll patch the handler to match.

Most likely NotebookLM uses a Google internal RPC endpoint
(`/_/NotebookLmUi/data/batchexecute`) with payloads encoded as
`f.req` form fields containing nested JSON arrays. Expect the
calibration to take an hour or two of going back and forth.

## Cookie rotation

Google cookies typically last days to weeks. When the `/health`
endpoint reports failures, re-export cookies and re-upload:

```
fly ssh sftp shell
> rm /secrets/cookies.txt
> put cookies.txt /secrets/cookies.txt
> quit
fly machines restart
```

## Cost

Fly.io shared-cpu-1x at 256 MB with auto-stop:
- Idle (autostopped): ~$0/mo
- Active (a few requests/day): ~$2–5/mo
- Continuous use: ~$5/mo
