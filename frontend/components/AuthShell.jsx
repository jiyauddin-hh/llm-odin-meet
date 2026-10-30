"use client";

import Link from "next/link";
import { useState } from "react";
import Icon, { LogoMark } from "./Icons";

const POINTS = [
  ["zap", "Instant verdicts from a sandboxed judge"],
  ["book-open", "Python, C++, DSA and Machine Learning courses"],
  ["trophy", "Daily live tests and a global leaderboard"],
];

/** Two-column auth layout: brand panel on the left, form card on the right. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-16">
      <aside className="hidden lg:block">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-brand-600/25 via-ink-900 to-accent-600/15 p-10 shadow-glow">
          <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="relative">
            <LogoMark className="h-12 w-12" />
            <h2 className="mt-8 text-3xl font-bold leading-tight tracking-tight text-white">
              Practice with purpose.
              <br />
              <span className="text-gradient">Compete with confidence.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {POINTS.map(([icon, text]) => (
                <li key={text} className="flex items-center gap-3 text-sm text-slate-200">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.1]">
                    <Icon name={icon} className="h-4 w-4 text-brand-200" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-10 rounded-2xl border border-white/[0.08] bg-ink-950/50 p-4 font-mono text-xs text-slate-300">
              <div className="text-slate-500">$ submit two_sum.py</div>
              <div className="mt-1 text-emerald-300">✓ Accepted · 12/12 tests · 38 ms · +20 pts</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="mx-auto w-full max-w-md animate-fade-up">
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <LogoMark className="h-8 w-8" />
          <span className="text-[15px] font-bold tracking-tight text-white">
            Quantum<span className="text-gradient"> Code</span>
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
        <div className="card-glow mt-6 p-6 sm:p-7">
          <div className="relative">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-slate-400">{footer}</p>}
      </div>
    </div>
  );
}

/** Text field with a label, optional leading icon and optional hint. */
export function Field({ label, icon, hint, right, ...props }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        {right}
      </div>
      <div className="relative">
        {icon && <Icon name={icon} className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />}
        <input className={`input ${icon ? "pl-10" : ""}`} {...props} />
      </div>
      {hint && <p className="help">{hint}</p>}
    </div>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordField({ label = "Password", right, hint, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        {right}
      </div>
      <div className="relative">
        <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="input pl-10 pr-11" type={show ? "text" : "password"} {...props} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
          aria-label={show ? "Hide password" : "Show password"}
        >
          <Icon name={show ? "eye-off" : "eye"} className="h-4 w-4" />
        </button>
      </div>
      {hint && <p className="help">{hint}</p>}
    </div>
  );
}
