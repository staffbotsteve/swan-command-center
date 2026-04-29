"""
Swan Command Center — Voice War Room (v0).

Minimal Gemini Live audio loop. Talks via the Mac's default mic +
speaker. No WebRTC, no phone numbers, no Pipecat — just a one-process
Python script you run when you want to talk to your agents.

Usage:
  ./companion/war-room/run.sh

Tools (v0): not wired yet. Talks freely with Steven; tool-calling
into the worker comes in v1 once the audio loop is solid.

Cost: roughly $0.50–$2 per 10-minute session at gemini-2.0-flash-live
pricing as of 2026-04. Run only when actively using it.

Stop with Ctrl+C.
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
from pathlib import Path

import numpy as np
import sounddevice as sd
from google import genai
from google.genai import types


def load_env_local() -> None:
    """Read GOOGLE_AI_API_KEY from app/.env.local if not already set."""
    if os.environ.get("GOOGLE_AI_API_KEY"):
        return
    candidate = Path(__file__).resolve().parents[2] / ".env.local"
    if not candidate.exists():
        return
    for line in candidate.read_text().splitlines():
        if line.startswith("GOOGLE_AI_API_KEY="):
            os.environ["GOOGLE_AI_API_KEY"] = line.split("=", 1)[1].strip()
            break


load_env_local()
API_KEY = os.environ.get("GOOGLE_AI_API_KEY")
if not API_KEY:
    print("ERROR: GOOGLE_AI_API_KEY not set (looked in env and app/.env.local)", file=sys.stderr)
    sys.exit(1)

MODEL = os.environ.get("WAR_ROOM_MODEL", "gemini-2.0-flash-live-001")
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

When Steven asks you to do something concrete (send a message, query
the task queue, look up a vault note), say "I'll queue that" and stop —
the v0 build doesn't have tool calls wired yet, so just acknowledge and
move on rather than pretending to do it.

Default response length: one or two sentences. Go longer only when
Steven explicitly asks for a briefing or a deep dive.
"""


async def run() -> None:
    client = genai.Client(api_key=API_KEY)
    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=types.Content(
            parts=[types.Part(text=SYSTEM_PROMPT)]
        ),
    )

    print(f"connecting to {MODEL}...", flush=True)
    async with client.aio.live.connect(model=MODEL, config=config) as session:
        print("connected. speak naturally; ctrl+c to stop.", flush=True)

        mic_q: asyncio.Queue[bytes] = asyncio.Queue()
        out_q: asyncio.Queue[bytes] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def mic_callback(indata, frames, time_info, status):  # noqa: ARG001
            if status:
                print(f"[mic] {status}", file=sys.stderr)
            pcm16 = (indata[:, 0] * 32767).astype(np.int16).tobytes()
            loop.call_soon_threadsafe(mic_q.put_nowait, pcm16)

        def speaker_callback(outdata, frames, time_info, status):  # noqa: ARG001
            if status:
                print(f"[spk] {status}", file=sys.stderr)
            try:
                chunk = out_q.get_nowait()
            except asyncio.QueueEmpty:
                outdata.fill(0)
                return
            need = frames * 2  # int16 mono
            if len(chunk) < need:
                # pad short tails with silence
                chunk = chunk + b"\x00" * (need - len(chunk))
            elif len(chunk) > need:
                # stash the leftover for the next call
                leftover = chunk[need:]
                chunk = chunk[:need]
                # cheap re-queue of leftover at the head
                loop.call_soon_threadsafe(out_q.put_nowait, leftover)
            samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32767.0
            outdata[:, 0] = samples

        async def send_loop() -> None:
            while True:
                pcm = await mic_q.get()
                await session.send_realtime_input(
                    audio=types.Blob(data=pcm, mime_type="audio/pcm;rate=16000")
                )

        async def recv_loop() -> None:
            async for response in session.receive():
                if response.data:
                    await out_q.put(response.data)
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
