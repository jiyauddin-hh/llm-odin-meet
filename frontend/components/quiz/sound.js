"use client";

// Game-show sounds made with the Web Audio API: no audio files to download.
// Browsers only allow sound after the user has clicked something, so call
// unlock() from a click (the host's Start button, a player's "Sound on").

let ctx = null;
let master = null;
let enabled = false;

export function unlock() {
  if (typeof window === "undefined") return false;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    ctx.resume?.();
    enabled = true;
  } catch {
    enabled = false;
  }
  return enabled;
}

export function mute() {
  enabled = false;
}

export const soundOn = () => enabled;

function tone({ freq, type = "sine", start = 0, dur = 0.2, gain = 0.3, slide = null, attack = 0.01 }) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ start = 0, dur = 0.3, gain = 0.3, freq = 1200, q = 0.8, type = "bandpass" }) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + start;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** The clock's last seconds. */
export const tick = (urgent = false) => tone({ freq: urgent ? 1320 : 990, type: "square", dur: 0.06, gain: 0.08 });

/** "Lock kiya jaye": a heavy thud. */
export function lock() {
  tone({ freq: 160, type: "sine", dur: 0.35, gain: 0.5, slide: 60 });
  noise({ dur: 0.15, gain: 0.2, freq: 400 });
}

/** A question appears: a rising whoosh and a chord. */
export function questionIn() {
  noise({ dur: 0.6, gain: 0.15, freq: 900, q: 0.5 });
  [220, 277, 330].forEach((f, i) => tone({ freq: f, type: "triangle", start: 0.25 + i * 0.02, dur: 1.1, gain: 0.12 }));
}

export function correct() {
  [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: "triangle", start: i * 0.09, dur: 0.45, gain: 0.22 }));
}

export function wrong() {
  tone({ freq: 140, type: "sawtooth", dur: 0.6, gain: 0.18, slide: 90 });
  tone({ freq: 147, type: "sawtooth", dur: 0.6, gain: 0.14, slide: 95 });
}

/** Suspense drumroll: fast snare hits getting louder. */
export function drumroll(seconds = 3) {
  if (!enabled || !ctx) return;
  const hits = Math.floor(seconds * 22);
  for (let i = 0; i < hits; i++) noise({ start: i / 22, dur: 0.06, gain: 0.05 + (0.25 * i) / hits, freq: 1800, q: 0.6 });
}

/** Big reveal hit: a boom and a cymbal crash. */
export function impact(big = false) {
  tone({ freq: big ? 70 : 90, type: "sine", dur: big ? 1.6 : 0.9, gain: 0.7, slide: 35 });
  noise({ dur: big ? 2.2 : 1.2, gain: big ? 0.35 : 0.22, freq: 6000, q: 0.3, type: "highpass" });
}

/** Champion fanfare: brassy rising chords. */
export function fanfare() {
  const chords = [
    [392, 494, 587],
    [440, 554, 659],
    [523, 659, 784, 1047],
  ];
  chords.forEach((c, i) =>
    c.forEach((f) => {
      tone({ freq: f, type: "sawtooth", start: i * 0.32, dur: i === 2 ? 1.8 : 0.3, gain: 0.07, attack: 0.03 });
      tone({ freq: f / 2, type: "square", start: i * 0.32, dur: i === 2 ? 1.8 : 0.3, gain: 0.03, attack: 0.03 });
    }),
  );
}

/** Someone joined the lobby. */
export const pop = () => tone({ freq: 880, type: "sine", dur: 0.12, gain: 0.12, slide: 1320 });
