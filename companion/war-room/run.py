"""
Swan Command Center — Voice War Room (v0).

Minimal Gemini Live audio loop. Talks via the Mac's default mic +
speaker. No WebRTC, no phone numbers, no Pipecat — just a one-process
Python script you run when you want to talk to your agents.

Usage:
  ./companion/war-room/run.sh

Tools (v0): not wired yet. Talks freely with Steven; tool-calling
into the worker comes in v1 once the audio loop is solid.

Cost: native-audio Flash pricing varies (per-second audio I/O,
typically a few dollars per long session). Verify on the live
pricing page before settling into daily use; run only when actively
using it.

Stop with Ctrl+C.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import signal
import sys
import urllib.parse
from pathlib import Path
from typing import Any

import numpy as np
import sounddevice as sd
import urllib.request
from google import genai
from google.genai import types


_ENV_KEYS = (
    "GOOGLE_AI_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GITHUB_PAT",
    "SLACK_BOT_TOKEN",
)


def load_env_local() -> None:
    """Read each known key from app/.env.local if not already set."""
    candidate = Path(__file__).resolve().parents[2] / ".env.local"
    if not candidate.exists():
        return
    needed = {k for k in _ENV_KEYS if not os.environ.get(k)}
    if not needed:
        return
    for line in candidate.read_text().splitlines():
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        if k in needed:
            os.environ[k] = v.strip()


load_env_local()
API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
if not API_KEY:
    print("ERROR: GOOGLE_AI_API_KEY not set (looked in env and app/.env.local)", file=sys.stderr)
    sys.exit(1)

MODEL = os.environ.get("WAR_ROOM_MODEL", "gemini-2.5-flash-native-audio-latest")
INPUT_SAMPLE_RATE = 16_000   # Gemini Live expects 16kHz input
OUTPUT_SAMPLE_RATE = 24_000  # Live returns 24kHz output
CHANNELS = 1
CHUNK_MS = 30                # send mic audio every 30 ms

SYSTEM_PROMPT = """\
You are Steven Swan's voice war-room assistant. Steven is talking to you
hands-free, often while driving or between meetings. Be terse, direct,
and genuinely useful — no preamble, no filler, no apologies.

You serve all 8 of Steven's LLCs (SwanBill, Providence Fire & Rescue,
E2S Transportation, E2S Properties AZ, e2s Properties, e2s Hospitality
CA/NV, plus Operations). Treat each as a real business with real stakes.

You have three tools available:
- hive_query: get the current task queue (filterable by company, project,
  status, agent role). Use this when Steven asks "what's on my plate" or
  "what's queued."
- vault_read_file: read any markdown file from his Obsidian vault repo
  (staffbotsteve/swan-vault). Use this for context on people, companies,
  or projects when Steven references them.
- slack_send_message: send a message to a Slack channel. Use this when
  Steven dictates a Slack to send. Confirm aloud with the channel and a
  short summary before sending.

# Slack channels Steven uses (pass the channel name without #):
- assistant-general    — catch-all triage, the default if Steven says
                         "assistant general" or "general"
- assistant-calendar   — calendar topics
- assistant-travel     — travel topics
- assistant-phone      — VIP screening, phone messages
- assistant-communication — general inbox triage
- swan-bill            — SwanBill LLC business
- all-swan-bill        — SwanBill LLC humans
- e2s-transport        — E2S Transportation LLC
- e2s-az               — E2S Properties AZ LLC
- e2s-properties       — e2s Properties LLC
- hosp-ca              — e2s Hospitality CA LLC
- hosp-nv              — e2s Hospitality NV LLC

When Steven says a channel name conversationally (e.g. "the assistant
general channel," "assistant general," "general"), map it to the
canonical name above and pass that to slack_send_message. Do NOT ask
for clarification when the name is obvious.

Default response length: one or two sentences. Go longer only when
Steven explicitly asks for a briefing or a deep dive.
"""

VAULT_REPO = os.environ.get("VAULT_REPO", "staffbotsteve/swan-vault")


# ── Tool declarations (Gemini Live function-calling) ──────────────────────

TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="hive_query",
                description=(
                    "Return Steven's current task queue across all agents and "
                    "channels. Filter by company, project, status, or agent role."
                ),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "company": types.Schema(type=types.Type.STRING),
                        "project": types.Schema(type=types.Type.STRING),
                        "status": types.Schema(
                            type=types.Type.STRING,
                            description="queued | in_flight | awaiting_user | done | failed",
                        ),
                        "agent_role": types.Schema(type=types.Type.STRING),
                        "limit": types.Schema(type=types.Type.INTEGER),
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="vault_read_file",
                description=(
                    "Read a markdown file from Steven's Obsidian vault on GitHub. "
                    "Path is relative to the vault root, e.g. "
                    "'02-Areas/Companies/SwanBill.md'."
                ),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "path": types.Schema(type=types.Type.STRING),
                    },
                    required=["path"],
                ),
            ),
            types.FunctionDeclaration(
                name="slack_send_message",
                description=(
                    "Send a Slack message to a channel. Always confirm with "
                    "Steven aloud before sending. channel can be a channel id "
                    "(C0...) or '#name'."
                ),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "channel": types.Schema(type=types.Type.STRING),
                        "text": types.Schema(type=types.Type.STRING),
                        "thread_ts": types.Schema(type=types.Type.STRING),
                    },
                    required=["channel", "text"],
                ),
            ),
        ]
    )
]


# ── Tool implementations ─────────────────────────────────────────────────


def _http_json(url: str, method: str = "GET", headers: dict | None = None,
               body: dict | None = None, timeout: float = 15.0) -> dict | list:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers=headers or {}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    if not raw:
        return {}
    return json.loads(raw)


def tool_hive_query(args: dict) -> dict:
    base = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        return {"error": "supabase env vars missing"}
    params: list[tuple[str, str]] = [
        ("select", "id,channel,company,project,status,created_at,input"),
        ("order", "created_at.desc"),
        ("limit", str(args.get("limit") or 20)),
    ]
    for col in ("company", "project", "status"):
        v = args.get(col)
        if v:
            params.append((col, f"eq.{v}"))
    role = args.get("agent_role")
    if role:
        # Tasks are joined to agents by agent_id; for v0 just filter at app
        # level via input metadata. Skipping for now to keep the SQL simple.
        pass
    qs = urllib.parse.urlencode(params)
    url = f"{base}/rest/v1/tasks?{qs}"
    rows = _http_json(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    return {"tasks": rows, "count": len(rows) if isinstance(rows, list) else 0}


def tool_vault_read_file(args: dict) -> dict:
    path = args.get("path", "").lstrip("/")
    pat = os.environ.get("GITHUB_PAT")
    if not pat:
        return {"error": "GITHUB_PAT missing"}
    if not path:
        return {"error": "path required"}
    url = f"https://api.github.com/repos/{VAULT_REPO}/contents/{urllib.parse.quote(path)}"
    try:
        resp = _http_json(
            url,
            headers={
                "Authorization": f"Bearer {pat}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "swan-war-room",
            },
        )
    except Exception as e:
        return {"error": f"vault fetch: {e}"}
    if isinstance(resp, dict) and resp.get("encoding") == "base64":
        import base64
        try:
            content = base64.b64decode(resp["content"]).decode("utf-8")
        except Exception as e:
            return {"error": f"decode: {e}"}
        # Trim very long files to keep voice responses snappy.
        if len(content) > 4000:
            content = content[:4000] + "\n…(truncated)"
        return {"path": path, "content": content}
    return {"error": "unexpected vault response", "raw": resp}


def tool_slack_send_message(args: dict) -> dict:
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token:
        return {"error": "SLACK_BOT_TOKEN missing"}
    channel = args.get("channel", "")
    text = args.get("text", "")
    if not channel or not text:
        return {"error": "channel and text required"}
    body = {"channel": channel, "text": text}
    if args.get("thread_ts"):
        body["thread_ts"] = args["thread_ts"]
    try:
        resp = _http_json(
            "https://slack.com/api/chat.postMessage",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=utf-8",
            },
            body=body,
        )
    except Exception as e:
        return {"error": f"slack: {e}"}
    if not isinstance(resp, dict) or not resp.get("ok"):
        return {"error": "slack rejected", "raw": resp}
    return {"ok": True, "channel": resp.get("channel"), "ts": resp.get("ts")}


TOOL_DISPATCH: dict[str, Any] = {
    "hive_query": tool_hive_query,
    "vault_read_file": tool_vault_read_file,
    "slack_send_message": tool_slack_send_message,
}


async def run() -> None:
    client = genai.Client(api_key=API_KEY)
    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=types.Content(
            parts=[types.Part(text=SYSTEM_PROMPT)]
        ),
        # Surface what each side actually said as text we can print.
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        tools=TOOLS,
    )

    print(f"connecting to {MODEL}...", flush=True)
    async with client.aio.live.connect(model=MODEL, config=config) as session:
        print("connected. speak naturally; ctrl+c to stop.", flush=True)

        mic_q: asyncio.Queue[bytes] = asyncio.Queue()
        # Thread-safe queue for the speaker callback (which runs on
        # sounddevice's audio thread, not the asyncio loop).
        spk_q: "queue.Queue[bytes]" = queue.Queue()
        # Pending tail of an oversized chunk, kept across speaker
        # callbacks so we never drop bytes.
        spk_tail: dict[str, bytes] = {"buf": b""}
        loop = asyncio.get_running_loop()

        def mic_callback(indata, frames, time_info, status):  # noqa: ARG001
            if status:
                print(f"[mic] {status}", file=sys.stderr)
            pcm16 = (indata[:, 0] * 32767).astype(np.int16).tobytes()
            loop.call_soon_threadsafe(mic_q.put_nowait, pcm16)

        def speaker_callback(outdata, frames, time_info, status):  # noqa: ARG001
            if status:
                print(f"[spk] {status}", file=sys.stderr)
            need = frames * 2  # int16 mono
            buf = spk_tail["buf"]
            while len(buf) < need:
                try:
                    buf += spk_q.get_nowait()
                except queue.Empty:
                    break
            if len(buf) >= need:
                chunk = buf[:need]
                spk_tail["buf"] = buf[need:]
            else:
                # Not enough audio: play what we have, pad the rest.
                chunk = buf + b"\x00" * (need - len(buf))
                spk_tail["buf"] = b""
            samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32767.0
            outdata[:, 0] = samples

        async def send_loop() -> None:
            while True:
                pcm = await mic_q.get()
                await session.send_realtime_input(
                    audio=types.Blob(data=pcm, mime_type="audio/pcm;rate=16000")
                )

        async def handle_tool_call(tc) -> None:
            """Run each requested function and ship the response back."""
            results: list[types.FunctionResponse] = []
            for call in (tc.function_calls or []):
                name = call.name
                args = dict(call.args or {})
                print(f"[tool] {name}({json.dumps(args)})", flush=True)
                fn = TOOL_DISPATCH.get(name)
                if fn is None:
                    out = {"error": f"unknown tool {name}"}
                else:
                    try:
                        out = await asyncio.to_thread(fn, args)
                    except Exception as e:  # noqa: BLE001
                        out = {"error": f"tool {name} raised: {e}"}
                # Print a short summary of the tool result for the terminal.
                summary = json.dumps(out)[:200]
                print(f"[tool→] {summary}", flush=True)
                results.append(
                    types.FunctionResponse(
                        id=call.id,
                        name=name,
                        response=out if isinstance(out, dict) else {"result": out},
                    )
                )
            await session.send_tool_response(function_responses=results)

        async def recv_loop() -> None:
            user_buf = ""
            asst_buf = ""
            async for response in session.receive():
                if response.data:
                    spk_q.put(response.data)
                # Tool calls — execute and respond.
                tc = getattr(response, "tool_call", None)
                if tc:
                    await handle_tool_call(tc)
                # Streamed audio transcripts arrive in small fragments;
                # accumulate and flush on punctuation/turn boundaries.
                sc = getattr(response, "server_content", None)
                if sc:
                    in_t = getattr(sc, "input_transcription", None)
                    if in_t and getattr(in_t, "text", None):
                        user_buf += in_t.text
                        if any(c in user_buf for c in ".!?\n") or len(user_buf) > 80:
                            print(f"[you] {user_buf.strip()}", flush=True)
                            user_buf = ""
                    out_t = getattr(sc, "output_transcription", None)
                    if out_t and getattr(out_t, "text", None):
                        asst_buf += out_t.text
                        if any(c in asst_buf for c in ".!?\n") or len(asst_buf) > 80:
                            print(f"[assistant] {asst_buf.strip()}", flush=True)
                            asst_buf = ""
                    # End-of-turn — flush whatever's left.
                    if getattr(sc, "turn_complete", False):
                        if user_buf.strip():
                            print(f"[you] {user_buf.strip()}", flush=True)
                            user_buf = ""
                        if asst_buf.strip():
                            print(f"[assistant] {asst_buf.strip()}", flush=True)
                            asst_buf = ""
                if response.text:
                    print(f"[assistant] {response.text}", flush=True)

        in_stream = sd.InputStream(
            samplerate=INPUT_SAMPLE_RATE,
            channels=CHANNELS,
            dtype="float32",
            blocksize=int(INPUT_SAMPLE_RATE * CHUNK_MS / 1000),
            callback=mic_callback,
        )
        out_stream = sd.OutputStream(
            samplerate=OUTPUT_SAMPLE_RATE,
            channels=CHANNELS,
            dtype="float32",
            blocksize=int(OUTPUT_SAMPLE_RATE * CHUNK_MS / 1000),
            callback=speaker_callback,
        )

        with in_stream, out_stream:
            await asyncio.gather(send_loop(), recv_loop())


def main() -> None:
    # Graceful Ctrl+C — sounddevice can hang otherwise.
    def handle_sigint(*_args):
        print("\nstopping war room.", flush=True)
        os._exit(0)

    signal.signal(signal.SIGINT, handle_sigint)
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
