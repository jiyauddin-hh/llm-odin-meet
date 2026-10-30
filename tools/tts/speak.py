"""Speaks many lines with one loaded voice.

stdin: JSON {"lines": [{"text": "...", "out": "/path/file.wav"}, ...], "lengthScale": 0.95}
Writes each WAV and prints {"ok": true}.
"""
import json
import os
import sys
import wave

from piper import PiperVoice, SynthesisConfig

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("PIPER_VOICE", os.path.join(HERE, "voices", "en_US-lessac-high.onnx"))


def main():
    job = json.load(sys.stdin)
    voice = PiperVoice.load(MODEL)
    # Slightly quicker than default and a little more expressive, for a reel's pace.
    config = SynthesisConfig(length_scale=job.get("lengthScale", 0.95), noise_scale=0.6, noise_w_scale=0.8)
    for line in job["lines"]:
        with wave.open(line["out"], "wb") as wf:
            voice.synthesize_wav(line["text"], wf, syn_config=config)
    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
