"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./Icons";

// Full-screen experiences (the reel feed, the coding workspace, the live test and a class room) have no footer.
const HIDE = [/^\/reels/, /^\/problems\/[^/]+$/, /^\/live\//, /^\/classroom\/[^/]+$/];

const COLUMNS = [
  {
    title: "Learn",
    links: [
      ["/problems", "Practice problems"],
      ["/courses", "Courses"],
      // ["/reels", "Reels"], (hidden for now, like the navbar tab)
      ["/leaderboard", "Leaderboard"],
    ],
  },
  {
    title: "Account",
    links: [
      ["/register", "Create account"],
      ["/login", "Log in"],
      ["/submissions", "My submissions"],
      ["/settings", "Settings"],
    ],
  },
];

export default function Footer() {
  const pathname = usePathname();
  if (HIDE.some((re) => re.test(pathname))) return null;
  return (
    <footer className="mt-16 border-t border-white/[0.06]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-white">
            <LogoMark className="h-7 w-7" />
            Quantum<span className="text-gradient"> Code</span>
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
            Hand-picked problems, instant verdicts in five languages, structured courses from Python to Machine Learning, and a
            daily live test. Everything you need to go from first line to job-ready.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            {["Python 3", "JavaScript", "C++17", "Java 21", "Go 1.22"].map((l) => (
              <span key={l} className="chip !cursor-default hover:!border-white/[0.08] hover:!text-slate-300">
                {l}
              </span>
            ))}
          </div>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-slate-300 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>© {new Date().getFullYear()} Quantum Code. Built for learners who ship.</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Sandboxed judge · Every submission runs in an isolated container
          </span>
        </div>
      </div>
    </footer>
  );
}
