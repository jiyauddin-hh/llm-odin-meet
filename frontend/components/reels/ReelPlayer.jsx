"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrayView, CodeView, DictView, SlidesView, StackView, arrayIds } from "./views";
import { GraphView, PlotView } from "./mlViews";

/*
 * Every reel is drawn on a fixed 400×711 (9:16) canvas and scaled to fit, so
 * the feed, the Studio preview and the downloaded MP4 look the same.
 * Layout keeps Instagram Reels' safe zones clear: Instagram puts its own UI
 * over the top ~14%, the bottom ~20% and the right edge.
 */
const W = 400;
const H = 711;
const SAFE = { top: 100, bottom: 568, side: 36, right: 52 };
const INTRO_MS = 2200;

/** YouTube watch / shorts / youtu.be link → embeddable URL, else null. */
export function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    let id = null;
    if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop();
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

/** Scales the 400×711 canvas to the size of its box. */
function useFitScale() {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(el.clientWidth / W, el.clientHeight / H) || 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

/** Shrinks its content if it's taller than the stage, so nothing spills over the caption. */
function FitBox({ children, height, deps }) {
  const inner = useRef(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const h = inner.current?.scrollHeight || 0;
    setK(h > height ? height / h : 1);
  }, [height, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ height }} className="flex items-center justify-center overflow-hidden">
      <div ref={inner} style={{ transform: `scale(${k})`, transformOrigin: "center" }} className="w-full">
        {children}
      </div>
    </div>
  );
}

/** Words light up one by one across `ms`. Code-ish words get a code style. */
function KaraokeCaption({ text, ms, playing }) {
  // Words, but code with brackets stays in one piece: "range(1, 5)" is one chunk.
  const words = useMemo(() => {
    const out = [];
    let depth = 0;
    for (const w of text.split(/\s+/).filter(Boolean)) {
      if (depth > 0) out[out.length - 1] += ` ${w}`;
      else out.push(w);
      depth = Math.max(0, depth + (w.match(/[([{]/g) || []).length - (w.match(/[)\]}]/g) || []).length);
    }
    return out;
  }, [text]);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!playing) return setShown(words.length);
    const each = Math.max(60, (ms * 0.9) / Math.max(words.length, 1));
    let n = 1;
    setShown(1);
    const t = setInterval(() => {
      n++;
      setShown(n);
      if (n >= words.length) clearInterval(t);
    }, each);
    return () => clearInterval(t);
  }, [text, ms, playing, words.length]);
  // Only real code gets the code style: calls, indexing, assignments, dotted names, snake_case.
  const codey = (w) => /`|[=()[\]{}<>]|\w\.\w|\w_\w/.test(w.replace(/[.,!?;:]+$/, ""));
  return (
    <p className="text-center text-[22px] font-extrabold leading-[1.28] tracking-[-0.01em] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
      {words.map((w, i) => (
        <span
          key={i}
          className={`mr-[0.28em] inline-block transition-all duration-300 ${i < shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"} ${
            i === shown - 1 && playing ? "text-amber-300" : ""
          } ${codey(w) ? "rounded-md bg-white/10 px-1 font-mono text-[19px] text-cyan-200" : ""}`}
        >
          {w.replace(/`/g, "")}
        </span>
      ))}
    </p>
  );
}

function Background() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0b0a1a]">
      <div className="reel-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-fuchsia-600/35 blur-3xl" />
      <div className="reel-blob absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-cyan-500/25 blur-3xl [animation-delay:-6s]" />
      <div className="reel-blob absolute -bottom-20 left-10 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl [animation-delay:-12s]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px]" />
    </div>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-cyan-500 text-[11px] font-black text-white">Q</span>
      <span className="text-[12px] font-bold text-white/90">Quantum Code</span>
    </span>
  );
}

function SafeZones() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-x-0 top-0 bg-rose-500/25" style={{ height: SAFE.top }} />
      <div className="absolute inset-x-0 bottom-0 bg-rose-500/25" style={{ top: SAFE.bottom }} />
      <div className="absolute right-0 bg-rose-500/20" style={{ top: SAFE.top, bottom: H - SAFE.bottom, width: SAFE.right }} />
      <div className="absolute left-2 top-2 rounded bg-black/70 px-1.5 text-[10px] text-rose-200">Instagram covers the red areas</div>
    </div>
  );
}

/** Plays a voice clip; resolves when it ends (or can't play). */
function playClip(url, audioRef) {
  return new Promise((resolve) => {
    try {
      audioRef.current?.pause();
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = resolve;
      a.onerror = resolve;
      a.play().catch(resolve);
    } catch {
      resolve();
    }
  });
}

function speakFallback(text) {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = resolve;
      u.onerror = resolve;
      synth.speak(u);
    } catch {
      resolve();
    }
  });
}

function AnimationPlayer({ reel, anim, active, voice, onFinish, renderMode, showSafeZones }) {
  const steps = anim.steps;
  const narration = reel.narration?.steps?.length === steps.length ? reel.narration : null;
  // -1 = intro card, 0..n-1 = steps
  const [i, setI] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [voiceDoneAt, setVoiceDoneAt] = useState(-2);
  const [timerDoneAt, setTimerDoneAt] = useState(-2);
  const audioRef = useRef(null);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const ids = useMemo(() => (anim.template === "array" ? arrayIds(steps) : null), [anim, steps]);

  const stepMs = anim.stepMs || 2800;
  // Each part lasts at least as long as its voice clip, plus a breath.
  const durationOf = (k) =>
    k === -1 ? Math.max(INTRO_MS, (narration?.intro?.ms ?? 0) + 350) : Math.max(stepMs, (narration?.steps[k]?.ms ?? 0) + 450);
  const voiceMsOf = (k) => (k === -1 ? narration?.intro?.ms : narration?.steps[k]?.ms) ?? durationOf(k) * 0.75;
  const running = active && !paused && !finished;
  const step = steps[Math.max(0, Math.min(i, steps.length - 1))];
  const hook = anim.hook || reel.title;

  const reset = () => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setTimerDoneAt(-2);
    setVoiceDoneAt(-2);
    setI(-1);
    setFinished(false);
    setPaused(false);
  };
  useEffect(reset, [anim]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) reset();
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timing marks let the video maker place each voice clip exactly.
  useEffect(() => {
    if (!renderMode || !running) return;
    window.__marks = window.__marks || [];
    window.__marks.push({ key: i === -1 ? "intro" : `s${i}`, t: performance.timeOrigin + performance.now() });
  }, [renderMode, running, i]);

  // Voice on the website (the MP4 gets the clips mixed in instead).
  useEffect(() => {
    if (!running || !voice || renderMode) return;
    let cancelled = false;
    const url = i === -1 ? narration?.intro?.url : narration?.steps[i]?.url;
    const text = i === -1 ? hook : step.say || step.caption;
    (url ? playClip(url, audioRef) : speakFallback(text)).then(() => !cancelled && setVoiceDoneAt(i));
    return () => {
      cancelled = true;
    };
  }, [running, voice, renderMode, i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setTimerDoneAt(i), durationOf(i));
    return () => clearTimeout(t);
  }, [running, i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running || timerDoneAt !== i || (voice && !renderMode && voiceDoneAt !== i)) return;
    if (i >= steps.length - 1) {
      setFinished(true);
      finishRef.current?.();
    } else setI(i + 1);
  }, [running, timerDoneAt, voiceDoneAt, voice, renderMode, i, steps.length]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const k = Math.max(0, i);
  const view = {
    code: <CodeView anim={anim} step={step} prev={steps[k - 1]} />,
    array: ids && <ArrayView anim={anim} step={step} ids={ids[k]} />,
    stack: <StackView anim={anim} step={step} />,
    dict: <DictView step={step} prev={steps[k - 1]} />,
    slides: <SlidesView step={step} />,
    plot: <PlotView anim={anim} step={step} />,
    graph: <GraphView anim={anim} step={step} />,
  }[anim.template];
  const topic = reel.topic ? `${reel.topic.chapter?.subject?.icon ?? ""} ${reel.topic.name}`.trim() : null;

  return (
    <div className="absolute inset-0 select-none" onClick={() => !renderMode && (finished ? reset() : setPaused(!paused))}>
      <Background />

      {/* Top band (under Instagram's UI): progress + logo */}
      <div className="absolute inset-x-0 top-0 px-4 pt-3" style={{ height: SAFE.top }}>
        <div className="flex gap-1">
          {steps.map((_, s) => (
            <div key={s} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                key={`${s}-${i}-${running}`}
                className="h-full rounded-full bg-white"
                style={
                  s < i || finished
                    ? { width: "100%" }
                    : s === i && running
                      ? { animation: `reel-progress ${durationOf(s)}ms linear forwards` }
                      : { width: "0%" }
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <Logo />
          {!renderMode && (
            <span className="text-[11px] text-white/50">
              {Math.max(1, i + 1)}/{steps.length}
            </span>
          )}
        </div>
      </div>

      {i === -1 ? (
        /* Intro: the hook, big */
        <div
          key="intro"
          className="absolute inset-x-0 flex flex-col items-center justify-center gap-4 text-center"
          style={{ top: SAFE.top, bottom: H - SAFE.bottom, paddingLeft: SAFE.side, paddingRight: SAFE.right }}
        >
          {topic && (
            <span className="reel-fade-up rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[13px] font-semibold text-white/90">{topic}</span>
          )}
          <h2 className="reel-hook text-[38px] font-black leading-[1.08] tracking-tight text-white [text-shadow:0_4px_24px_rgba(139,92,246,0.55)]">
            {hook}
          </h2>
          {anim.hook && <p className="reel-fade-up text-[15px] font-semibold text-cyan-200 [animation-delay:0.35s]">{reel.title}</p>}
        </div>
      ) : (
        <>
          {/* Title band */}
          <div className="absolute inset-x-0 text-center" style={{ top: SAFE.top + 2, paddingLeft: SAFE.side, paddingRight: SAFE.right }}>
            <div className="truncate text-[17px] font-extrabold text-white">{reel.title}</div>
            {topic && <div className="mt-0.5 text-[12px] font-medium text-white/55">{topic}</div>}
          </div>
          {/* Stage */}
          <div key={`stage-${i}`} className="reel-step absolute inset-x-0" style={{ top: SAFE.top + 52, paddingLeft: SAFE.side - 8, paddingRight: SAFE.right - 16 }}>
            <FitBox height={290} deps={[i, anim]}>
              {view}
            </FitBox>
          </div>
          {/* Caption */}
          <div
            className="absolute inset-x-0 flex items-center justify-center"
            style={{ top: SAFE.top + 350, height: SAFE.bottom - SAFE.top - 350, paddingLeft: SAFE.side, paddingRight: SAFE.right }}
          >
            <KaraokeCaption key={i} text={step.caption} ms={voiceMsOf(i)} playing={running} />
          </div>
        </>
      )}

      {showSafeZones && <SafeZones />}
      {paused && !finished && !renderMode && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 px-6 py-4 text-4xl text-white">▶</span>
        </div>
      )}
      {finished && !renderMode && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <span className="text-5xl text-white">↻</span>
          <span className="text-base font-semibold text-white">Tap to replay</span>
        </div>
      )}
    </div>
  );
}

function VideoPlayer({ url, active }) {
  const ref = useRef(null);
  const yt = youtubeEmbed(url);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) v.play().catch(() => {});
    else {
      v.pause();
      v.currentTime = 0;
    }
  }, [active]);
  if (yt) {
    return active ? (
      <iframe src={`${yt}?autoplay=1&playsinline=1&rel=0`} title="Reel video" className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
    ) : (
      <div className="flex h-full items-center justify-center text-5xl text-white/70">▶</div>
    );
  }
  return <video ref={ref} src={url} className="h-full w-full bg-black object-contain" controls playsInline preload="metadata" />;
}

/**
 * Plays one reel inside a 9:16 frame. Only the `active` reel plays.
 * `voice` plays the voice-over (or the browser's voice if none was made yet).
 */
export default function ReelPlayer({ reel, active = true, voice = false, onFinish, renderMode = false, showSafeZones = false }) {
  const [box, scale] = useFitScale();
  return (
    <div
      ref={box}
      className={`relative aspect-[9/16] h-full max-h-full max-w-full overflow-hidden bg-[#0b0a1a] ${renderMode ? "" : "rounded-2xl border border-ink-700 shadow-2xl"}`}
    >
      {reel.kind === "VIDEO" ? (
        reel.videoUrl ? <VideoPlayer url={reel.videoUrl} active={active} /> : <div className="p-6 text-slate-500">No video yet.</div>
      ) : reel.animation?.steps?.length ? (
        <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <AnimationPlayer
            reel={reel}
            anim={reel.animation}
            active={active}
            voice={voice}
            onFinish={onFinish}
            renderMode={renderMode}
            showSafeZones={showSafeZones}
          />
        </div>
      ) : (
        <div className="p-6 text-slate-500">No steps yet.</div>
      )}
    </div>
  );
}
