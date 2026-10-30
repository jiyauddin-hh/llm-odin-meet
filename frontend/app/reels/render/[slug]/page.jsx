"use client";

// Used only by the server's video maker: plays one reel full-frame, then an
// outro card. window.__start() begins playback; window.__reelDone flags the
// end; window.__marks records when each voice clip should start.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import ReelPlayer from "@/components/reels/ReelPlayer";

const OUTRO_MIN_MS = 2800;

export default function RenderReelPage({ params }) {
  const [reel, setReel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/reels/${params.slug}`)
      .then((d) => setReel(d.reel))
      .catch((e) => setError(e.message));
  }, [params.slug]);

  useEffect(() => {
    if (!reel) return;
    window.__marks = [];
    window.__start = () => setPlaying(true);
    // Let fonts and the first frame settle before saying we're ready.
    document.fonts.ready.then(() => requestAnimationFrame(() => (window.__reelReady = true)));
  }, [reel]);

  useEffect(() => {
    if (!ended) return;
    window.__marks.push({ key: "outro", t: performance.timeOrigin + performance.now() });
    const ms = Math.max(OUTRO_MIN_MS, (reel.narration?.outro?.ms ?? 0) + 800);
    const t = setTimeout(() => (window.__reelDone = true), ms);
    return () => clearTimeout(t);
  }, [ended, reel]);

  if (error) return <div className="fixed inset-0 z-[100] bg-black p-6 text-rose-300">{error}</div>;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0b0a1a]">
      {reel && !ended && <ReelPlayer reel={reel} active={playing} renderMode onFinish={() => setTimeout(() => setEnded(true), 500)} />}
      {reel && ended && (
        <div className="relative h-full w-full overflow-hidden">
          <div className="absolute inset-0 bg-[#0b0a1a]">
            <div className="reel-blob absolute -left-24 top-24 h-96 w-96 rounded-full bg-fuchsia-600/40 blur-3xl" />
            <div className="reel-blob absolute -right-24 bottom-48 h-96 w-96 rounded-full bg-cyan-500/30 blur-3xl [animation-delay:-8s]" />
          </div>
          {/* Content stays between Instagram's top and bottom overlays. */}
          <div className="absolute inset-x-0 flex flex-col items-center justify-center gap-5 px-12 text-center" style={{ top: "14%", bottom: "20%" }}>
            <div className="reel-hook flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-cyan-500 text-5xl font-black text-white shadow-[0_0_50px_rgba(139,92,246,0.6)]">
              Q
            </div>
            <div className="reel-fade-up text-4xl font-black text-white">Quantum Code</div>
            <div className="reel-fade-up text-xl font-semibold text-white/75 [animation-delay:0.2s]">{reel.title}</div>
            <div className="reel-fade-up mt-3 rounded-2xl border border-brand-400/60 bg-brand-500/25 px-6 py-3.5 text-xl font-bold text-white [animation-delay:0.4s]">
              💻 Practise it on Quantum Code
            </div>
            <div className="reel-fade-up text-2xl font-black text-amber-300 [animation-delay:0.7s]">Follow for more ➜</div>
            {process.env.NEXT_PUBLIC_SITE_URL && (
              <div className="reel-fade-up text-base text-white/50 [animation-delay:0.8s]">{process.env.NEXT_PUBLIC_SITE_URL}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
