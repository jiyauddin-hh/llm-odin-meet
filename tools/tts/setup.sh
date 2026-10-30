#!/usr/bin/env bash
# Installs the offline neural voice (Piper) used for reel voice-overs. Safe to re-run.
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/piper ] || { python3 -m venv .venv && .venv/bin/pip install -q "piper-tts==1.3.0"; }
VOICE=en_US-lessac-high
BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high
for f in $VOICE.onnx $VOICE.onnx.json; do
  [ -s voices/$f ] || curl -sfL -o voices/$f "$BASE/$f"
done
echo "Voice ready: $(du -sh voices | cut -f1)"
