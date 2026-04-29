#!/bin/bash
# Launch the voice war room.
#
# v0: local mic + speaker, Gemini Live brain, no tools yet.
# Ctrl+C to stop.

set -euo pipefail
cd "$(dirname "$0")"
exec ./.venv/bin/python run.py
