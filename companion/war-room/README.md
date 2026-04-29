# Voice War Room

Hands-free voice channel into the Swan Command Center. Run it on your
Mac and talk to the assistant via the laptop's mic and speaker.

## v0 status

- Local mic + speaker (no WebRTC, no Daily.co, no Twilio)
- Gemini Live as the brain (`gemini-2.0-flash-live-001` by default)
- No tool calls yet — pure conversation
- Costs roughly $0.50–$2 per 10-minute session at current Live pricing

## Setup (one-time)

```bash
cd /Users/stevenswan/project-folders/swan-command-center/app/companion/war-room
/usr/local/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The script reads `GOOGLE_AI_API_KEY` from `app/.env.local` automatically.

## Run

```bash
./companion/war-room/run.sh
```

You'll see `connected. speak naturally; ctrl+c to stop.` Talk into the
mic; the assistant talks back through the speaker. Ctrl+C ends the
session.

## Roadmap

- v1: wire three tools — `hive_query`, `vault_read_file`,
  `slack_send_message` — so you can dictate Slack messages and get the
  current task queue read back.
- v2: WebRTC trigger so you can join from your phone instead of the Mac.
- v3: Twilio number so you can literally call the war room.
