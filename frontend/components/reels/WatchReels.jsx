"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "../Icons";

/** "Watch the reel" links for the reels made for these topics. */
export default function WatchReels({ topicIds, className = "" }) {
  const [reels, setReels] = useState([]);
  const key = [...new Set(topicIds.filter(Boolean))].sort().join(",");

  useEffect(() => {
    if (!key) return setReels([]);
    api(`/reels?topics=${key}&limit=3`).then((d) => setReels(d.reels)).catch(() => setReels([]));
  }, [key]);

  if (!reels.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {reels.map((r) => (
        <Link
          key={r.id}
          href={`/reels?r=${r.slug}`}
          className="group inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-gradient-to-r from-fuchsia-500/15 to-pink-500/10 py-1 pl-1.5 pr-3.5 text-sm text-fuchsia-100 transition hover:border-fuchsia-400/60 hover:from-fuchsia-500/25"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-500 text-white shadow-[0_0_12px_rgba(217,70,239,0.6)]">
            <Icon name="play" className="h-3 w-3 translate-x-px" strokeWidth={0} fill="currentColor" />
          </span>
          <span>
            <span className="text-fuchsia-300/80">Reel · </span>
            {r.title}
          </span>
        </Link>
      ))}
    </div>
  );
}
