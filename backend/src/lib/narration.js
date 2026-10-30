// Voice-overs for reels, made offline with the Piper neural voice
// (tools/tts). Each reel gets an intro (its hook), one clip per step and an
// outro. Clips are stored as WAV (for mixing into the MP4) and MP3 (for the
// website), and reused until the spoken text changes.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TTS_DIR = fileURLToPath(new URL("../../../tools/tts", import.meta.url));
const PYTHON = join(TTS_DIR, ".venv", "bin", "python");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const VOICE = "lessac-high";

export const OUTRO_TEXT = "Practise this on Quantum Code. And follow for more!";

export function ttsAvailable() {
  return existsSync(PYTHON) && existsSync(join(TTS_DIR, "voices", "en_US-lessac-high.onnx"));
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** Turns a caption with code symbols into something a voice can read. */
export function speakable(text) {
  return text
    .replace(/`/g, "")
    .replace(/\bO\(([^)]*)\)/g, "O of $1")
    .replace(/(\w)\[(-?\w*):(-?\w*)\]/g, (_, v, a, b) => `${v}, slice ${a || "start"} to ${b || "end"}`)
    .replace(/(\w)\[(-?\w+)\]/g, "$1 at index $2")
    .replace(/\blen\(([^)]*)\)/g, "length of $1")
    .replace(/(\w+)\(\)/g, "$1")
    .replace(/==/g, " equals equals ")
    .replace(/!=/g, " is not equal to ")
    .replace(/>=/g, " is at least ")
    .replace(/<=/g, " is at most ")
    .replace(/\+=/g, " plus equals ")
    .replace(/-=/g, " minus equals ")
    .replace(/\*=/g, " times equals ")
    .replace(/\*\*/g, " to the power of ")
    .replace(/\/\//g, " floor divide ")
    .replace(/->|→/g, " gives ")
    .replace(/\s%\s/g, " mod ")
    .replace(/(\d)%/g, "$1 percent")
    .replace(/\s=\s/g, " equals ")
    .replace(/\s>\s/g, " is greater than ")
    .replace(/\s<\s/g, " is less than ")
    .replace(/\[\]/g, " an empty list ")
    .replace(/\{\}/g, " an empty dictionary ")
    .replace(/[[\]{}()"'_|#~^;]/g, " ")
    .replace(/\b(\d{1,2})\b/g, (m) => NUMBER_WORDS[Number(m)] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything the voice will say for this reel, in order. */
export function scriptFor(reel) {
  const a = reel.animation;
  return {
    intro: speakable(a.hook || reel.title).replace(/\p{Extended_Pictographic}/gu, "").trim(),
    steps: a.steps.map((s) => s.say || speakable(s.caption)),
    outro: OUTRO_TEXT,
  };
}

export function narrationHash(reel) {
  return createHash("sha1").update(JSON.stringify({ VOICE, ...scriptFor(reel) })).digest("hex").slice(0, 16);
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`))));
    if (input !== undefined) p.stdin.end(input);
  });
}

export async function durationMs(file) {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Math.round(parseFloat(out) * 1000);
}

/** Speaks each { text, out } line into a WAV file, loading the voice once. */
export async function speakLines(lines, lengthScale = 1) {
  if (!ttsAvailable()) throw new Error("The voice isn't installed. Run tools/tts/setup.sh");
  await run(PYTHON, [join(TTS_DIR, "speak.py")], JSON.stringify({ lines, lengthScale }));
}

/** Web copy of a WAV: MP3 at 48 kHz, gently loudness-matched. */
export async function wavToMp3(wav, mp3) {
  await run(FFMPEG, ["-y", "-v", "error", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "48000", "-c:a", "libmp3lame", "-q:a", "3", mp3]);
}

/**
 * Makes (or reuses) the voice-over for a reel and returns the narration object
 * { hash, voice, intro, steps, outro }, each part { url, ms }.
 */
export async function narrate(reel, uploadDir) {
  if (!ttsAvailable()) throw new Error("The voice isn't installed. Run tools/tts/setup.sh");
  const hash = narrationHash(reel);
  if (reel.narration?.hash === hash && existsSync(join(uploadDir, reel.narration.intro.url.replace(/^\/uploads\//, "")))) {
    return reel.narration;
  }
  const folder = `reels/voice/${reel.slug}-${hash}`;
  const dir = join(uploadDir, folder);
  await mkdir(dir, { recursive: true });

  const script = scriptFor(reel);
  const parts = [["intro", script.intro], ...script.steps.map((t, i) => [`s${String(i).padStart(2, "0")}`, t]), ["outro", script.outro]];
  await run(PYTHON, [join(TTS_DIR, "speak.py")], JSON.stringify({ lines: parts.map(([name, text]) => ({ text, out: join(dir, `${name}.wav`) })) }));

  const clip = async (name) => {
    const wav = join(dir, `${name}.wav`);
    // Web copy: MP3 at 48 kHz, gently loudness-matched.
    await run(FFMPEG, ["-y", "-v", "error", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "48000", "-c:a", "libmp3lame", "-q:a", "3", join(dir, `${name}.mp3`)]);
    return { url: `/uploads/${folder}/${name}.mp3`, ms: await durationMs(wav) };
  };
  const narration = {
    hash,
    voice: VOICE,
    intro: await clip("intro"),
    steps: await Promise.all(script.steps.map((_, i) => clip(`s${String(i).padStart(2, "0")}`))),
    outro: await clip("outro"),
  };

  // Drop the previous version's clips.
  if (reel.narration?.hash && reel.narration.hash !== hash) {
    await rm(join(uploadDir, `reels/voice/${reel.slug}-${reel.narration.hash}`), { recursive: true, force: true });
  }
  return narration;
}

/** WAV path on disk for a narration part's URL. */
export const wavPath = (uploadDir, url) => join(uploadDir, url.replace(/^\/uploads\//, "").replace(/\.mp3$/, ".wav"));
