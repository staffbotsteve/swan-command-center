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
import os
import queue
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
        # Surface what each side actually said as text we can print.
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
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

        async def recv_loop() -> None:
            user_buf = ""
            asst_buf = ""
            async for response in session.receive():
                if response.data:
                    spk_q.put(response.data)
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
