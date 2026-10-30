"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReelPlayer from "@/components/reels/ReelPlayer";
import { ErrorBox, Spinner } from "@/components/ui";

function ActionButton({ icon, label, onClick, active, href }) {
  const body = (
    <>
      <span className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ring-1 ring-inset transition ${active ? "bg-brand-500 text-white ring-brand-400/50 shadow-glow-sm" : "bg-white/[0.06] ring-white/[0.08] hover:bg-white/[0.12]"}`}>
        {icon}
      </span>
      <span className="text-[11px] text-slate-300">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-1";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button className={cls} onClick={onClick}>
      {body}
    </button>
  );
}

function viewedOnce(id) {
  try {
    const key = `qc_reel_viewed_${id}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {}
  return true;
}

function Feed() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const startSlug = search.get("r");
  const [subject, setSubject] = useState(search.get("subject") || "");
  const [saved, setSaved] = useState(search.get("saved") === "1");
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const [voice, setVoice] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const scroller = useRef(null);
  const items = useRef([]);

  useEffect(() => {
    if (loading) return;
    setData(null);
    const params = new URLSearchParams({ ...(subject && { subject }), ...(saved && { saved: "1" }) });
    api(`/reels?${params}`)
      .then((d) => {
        setData(d);
        const start = startSlug ? Math.max(0, d.reels.findIndex((r) => r.slug === startSlug)) : 0;
        setActive(start);
        requestAnimationFrame(() => items.current[start]?.scrollIntoView({ block: "start" }));
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, subject, saved]);

  // The reel that fills most of the screen is the one that plays.
  useEffect(() => {
    if (!data?.reels.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(Number(e.target.dataset.index));
      },
      { root: scroller.current, threshold: [0.6] },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [data]);

  const current = data?.reels[active];
  useEffect(() => {
    if (current && viewedOnce(current.id)) api(`/reels/${current.id}/view`, { method: "POST" }).catch(() => {});
  }, [current]);

  // Arrow keys move between reels.
  useEffect(() => {
    const onKey = (e) => {
      if (!data?.reels.length || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const next = Math.min(data.reels.length - 1, Math.max(0, active + (e.key === "ArrowDown" ? 1 : -1)));
      items.current[next]?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, active]);

  const flash = (text) => {
    setToast(text);
    setTimeout(() => setToast(""), 1800);
  };

  const toggle = useCallback(
    async (reel, kind) => {
      if (!user) return router.push("/login");
      const on = kind === "like" ? !reel.liked : !reel.saved;
      setData((d) => ({
        ...d,
        reels: d.reels.map((r) =>
          r.id !== reel.id ? r : kind === "like" ? { ...r, liked: on, likes: r.likes + (on ? 1 : -1) } : { ...r, saved: on },
        ),
      }));
      try {
        await api(`/reels/${reel.id}/${kind}`, { method: on ? "POST" : "DELETE" });
        if (kind === "save") flash(on ? "Saved to your reels" : "Removed from saved");
      } catch (e) {
        flash(e.message);
      }
    },
    [user, router],
  );

  const [downloading, setDownloading] = useState(null);
  const download = async (reel) => {
    if (reel.download === "login") return router.push("/login");
    if (reel.download === "preparing") return flash("The video is being prepared. Try again in a minute.");
    setDownloading(reel.id);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/reels/${reel.id}/download`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed");
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") || "")?.[1] || `${reel.slug}.mp4`;
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flash("Downloaded");
    } catch (e) {
      flash(e.message);
    } finally {
      setDownloading(null);
    }
  };

  const share = async (reel) => {
    const url = `${window.location.origin}/reels?r=${reel.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      flash(url);
    }
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex px-4 py-2 sm:justify-center">
        <div className="segmented pointer-events-auto max-w-full overflow-x-auto whitespace-nowrap bg-ink-950/70 backdrop-blur-xl">
        <button className={`tab ${!subject && !saved ? "tab-active" : ""}`} onClick={() => { setSubject(""); setSaved(false); }}>
          For you
        </button>
        {data?.subjects.map((s) => (
          <button key={s.id} className={`tab ${subject === String(s.id) ? "tab-active" : ""}`} onClick={() => { setSubject(String(s.id)); setSaved(false); }}>
            {s.icon} {s.name}
          </button>
        ))}
        {user && (
          <button className={`tab ${saved ? "tab-active" : ""}`} onClick={() => { setSaved(true); setSubject(""); }}>
            🔖 Saved
          </button>
        )}
        <button className={`tab ${voice ? "tab-active" : ""}`} onClick={() => setVoice(!voice)} title="Read captions aloud">
          {voice ? "🔊 Voice on" : "🔈 Voice off"}
        </button>
        </div>
      </div>

      <ErrorBox error={error} />
      {!data ? (
        <Spinner label="Loading reels…" />
      ) : data.reels.length === 0 ? (
        <div className="py-32 text-center text-slate-400">{saved ? "You haven't saved any reels yet." : "No reels here yet."}</div>
      ) : (
        <div ref={scroller} className="reel-snap h-[calc(100dvh-3.5rem)] overflow-y-auto max-sm:h-[calc(100dvh-6.25rem)]">
          {data.reels.map((r, idx) => (
            <section
              key={r.id}
              ref={(el) => (items.current[idx] = el)}
              data-index={idx}
              className="flex h-[calc(100dvh-3.5rem)] items-center justify-center gap-4 px-3 pb-4 pt-14 max-sm:h-[calc(100dvh-6.25rem)] max-sm:flex-col max-sm:gap-2 max-sm:pb-2"
            >
              <div className="relative flex h-full min-h-0 max-w-full items-center max-sm:flex-1">
                <ReelPlayer reel={r} active={idx === active} voice={voice} />
              </div>
              <div className="flex w-28 flex-col items-center gap-4 self-end pb-6 max-sm:w-full max-sm:flex-row max-sm:justify-center max-sm:gap-6 max-sm:self-auto max-sm:pb-0">
                <ActionButton icon={r.liked ? "❤️" : "🤍"} label={r.likes} active={r.liked} onClick={() => toggle(r, "like")} />
                <ActionButton icon="🔖" label={r.saved ? "Saved" : "Save"} active={r.saved} onClick={() => toggle(r, "save")} />
                <ActionButton icon="🔗" label="Share" onClick={() => share(r)} />
                {r.download !== "off" && (
                  <ActionButton
                    icon={downloading === r.id ? "⏳" : "⬇"}
                    label={downloading === r.id ? "Saving…" : r.download === "preparing" ? "Preparing" : "Download"}
                    onClick={() => download(r)}
                  />
                )}
                {r.practiceSlug && <ActionButton icon="💻" label="Practice" href={`/problems/${r.practiceSlug}`} />}
                <div className="hidden max-w-[7rem] text-center sm:block">
                  <div className="text-sm font-semibold leading-tight text-white">{r.title}</div>
                  {r.topic && <div className="mt-1 text-[11px] text-slate-400">{r.topic.chapter.subject.icon} {r.topic.name}</div>}
                  <div className="mt-1 text-[11px] text-slate-500">{r.views} views</div>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      {toast && <div className="fixed bottom-8 left-1/2 z-30 -translate-x-1/2 animate-fade-up rounded-full border border-white/10 bg-ink-900/90 px-4 py-2 text-sm text-white shadow-card-hover backdrop-blur">{toast}</div>}
    </div>
  );
}

export default function ReelsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Feed />
    </Suspense>
  );
}
