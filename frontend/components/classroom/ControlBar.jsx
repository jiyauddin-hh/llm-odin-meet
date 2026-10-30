"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icons";

/** Hover label above a control (desktop); the button keeps its aria-label for screen readers. */
function Tip({ text }) {
  if (!text) return null;
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-[11px] font-medium text-slate-100 opacity-0 shadow-lg ring-1 ring-white/10 transition group-hover:opacity-100 sm:block">
      {text}
    </span>
  );
}

/** Small padlock on a control the admin has turned off. */
function Locked() {
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-[1.15rem] w-[1.15rem] items-center justify-center rounded-full bg-ink-800 text-slate-300 ring-2 ring-ink-950">
      <Icon name="lock" className="h-2.5 w-2.5" strokeWidth={2.5} />
    </span>
  );
}

const BLOCKED = "Turned off by your admin";

function Badge({ n, tone = "bg-brand-500" }) {
  if (!n) return null;
  return <span className={`absolute -right-1 -top-1 min-w-[1.15rem] rounded-full ${tone} px-1 text-center text-[10px] font-bold leading-[1.15rem] text-white ring-2 ring-ink-950`}>{n > 99 ? "99+" : n}</span>;
}

/** Microphone / camera: neutral when on, red when off. */
function Toggle({ on, icon, iconOff, label, onClick, disabled, tip, locked }) {
  return (
    <span className="group relative">
      <button
        onClick={onClick}
        disabled={disabled || locked}
        aria-label={label}
        aria-pressed={on}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full transition sm:h-12 sm:w-12 disabled:cursor-not-allowed ${
          locked ? "bg-white/[0.04] text-slate-500" : on ? "bg-white/[0.1] text-white hover:bg-white/[0.16]" : "bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-40"
        }`}
      >
        <Icon name={on ? icon : iconOff} className="h-5 w-5" strokeWidth={2} />
        {locked && <Locked />}
      </button>
      <Tip text={locked ? BLOCKED : tip || label} />
    </span>
  );
}

function Plain({ icon, label, onClick, active, badge, badgeTone, tip, locked }) {
  return (
    <span className="group relative">
      <button
        onClick={onClick}
        disabled={locked}
        aria-label={label}
        aria-pressed={!!active}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full transition sm:h-12 sm:w-12 disabled:cursor-not-allowed ${
          locked
            ? "bg-white/[0.04] text-slate-500"
            : active
              ? "bg-brand-500/25 text-brand-100 ring-1 ring-inset ring-brand-400/40"
              : "bg-white/[0.06] text-slate-200 hover:bg-white/[0.12]"
        }`}
      >
        <Icon name={icon} className="h-5 w-5" strokeWidth={2} />
        {locked ? <Locked /> : <Badge n={badge} tone={badgeTone} />}
      </button>
      <Tip text={locked ? BLOCKED : tip || label} />
    </span>
  );
}

/** End-class confirmation that floats above the button; closes on Escape or a click outside. */
function EndConfirm({ onEnd, onCancel }) {
  const box = useRef(null);
  useEffect(() => {
    const down = (e) => box.current && !box.current.contains(e.target) && onCancel();
    const key = (e) => e.key === "Escape" && onCancel();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onCancel]);
  return (
    <div ref={box} role="dialog" aria-label="End the class" className="absolute bottom-full right-0 z-20 mb-3 w-72 animate-scale-in rounded-2xl border border-white/[0.1] bg-ink-900 p-4 shadow-2xl sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
      <p className="font-semibold text-white">End the class for everyone?</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">Everyone is disconnected and the code stops working. The code in the editor is saved.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-danger btn-sm" onClick={onEnd} autoFocus>
          End class
        </button>
      </div>
    </div>
  );
}

/** Meet-style bar at the bottom of the room. */
export default function ControlBar({
  call, hand, onHand, perms, isTeacher, mode, onMode, onLeave, onEnd, confirmEnd, setConfirmEnd,
  chatUnread, onChat, sidebar, onPeople, peopleCount, hands, elapsed, code,
}) {
  const { local, secure } = call;
  // Phones and tablets have no screen capture; don't offer a button that can't work.
  const [canPresent, setCanPresent] = useState(true);
  useEffect(() => setCanPresent(!!navigator.mediaDevices?.getDisplayMedia), []);
  const [copied, setCopied] = useState(false);
  const copyCode = () =>
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  const insecure = !secure ? "Camera and microphone need HTTPS (or localhost)" : undefined;
  return (
    <footer className="sticky bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/90 px-2 py-2 backdrop-blur-xl sm:px-3 sm:py-2.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Left: time and class */}
        <div className="hidden min-w-0 items-center gap-3 text-sm md:flex">
          <span className="font-mono tabular-nums text-slate-200">{elapsed}</span>
          <span className="h-4 w-px bg-white/10" />
          <button
            onClick={copyCode}
            title="Copy the class code"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[13px] tracking-[0.2em] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            {code}
            <Icon name={copied ? "check" : "copy"} className={`h-3.5 w-3.5 ${copied ? "text-emerald-300" : "text-slate-500"}`} />
          </button>
          {!secure && (
            <span className="hidden items-center gap-1 text-xs text-amber-300 xl:flex" title="See README → Live classroom">
              <Icon name="alert-triangle" className="h-3.5 w-3.5" /> HTTPS needed for camera & mic
            </span>
          )}
        </div>

        {/* Centre: call controls */}
        <div className="col-span-3 flex items-center justify-center gap-1.5 sm:gap-2 md:col-span-1">
          <Toggle on={local.mic} icon="mic" iconOff="mic-off" label={local.mic ? "Turn off microphone" : "Turn on microphone"} onClick={call.toggleMic} disabled={!secure} tip={insecure} locked={!perms.mic} />
          <Toggle on={local.cam} icon="video" iconOff="video-off" label={local.cam ? "Turn off camera" : "Turn on camera"} onClick={call.toggleCam} disabled={!secure} tip={insecure} locked={!perms.cam} />
          {(canPresent || local.screen) && <Plain icon="monitor" label={local.screen ? "Stop presenting" : "Present your screen"} onClick={call.toggleScreen} active={local.screen} locked={!perms.screen} />}
          {!isTeacher && <Plain icon="hand" label={hand ? "Lower your hand" : "Raise your hand"} onClick={() => onHand(!hand)} active={hand} />}
          {/* Wider screens switch views from the Code / Meet control in the top bar. */}
          <span className="sm:hidden">
            <Plain icon={mode === "meet" ? "code" : "grid"} label={mode === "meet" ? "Show the code editor" : "Show the video grid"} onClick={() => onMode(mode === "meet" ? "code" : "meet")} />
          </span>
          <span className="relative ml-1">
            {isTeacher ? (
              <>
                <button
                  className="flex h-11 items-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(225,29,72,0.6)] transition hover:bg-rose-500 sm:h-12 sm:px-5"
                  onClick={() => setConfirmEnd((v) => !v)}
                  aria-label="End class"
                  aria-expanded={confirmEnd}
                >
                  <Icon name="phone-off" className="h-5 w-5" strokeWidth={2} />
                  <span className="hidden sm:inline">End</span>
                </button>
                {confirmEnd && <EndConfirm onEnd={onEnd} onCancel={() => setConfirmEnd(false)} />}
              </>
            ) : (
              <button className="flex h-11 items-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(225,29,72,0.6)] transition hover:bg-rose-500 sm:h-12 sm:px-5" onClick={onLeave} aria-label="Leave class">
                <Icon name="phone-off" className="h-5 w-5" strokeWidth={2} />
                <span className="hidden sm:inline">Leave</span>
              </button>
            )}
          </span>
          {/* On small screens the panel buttons sit in the same row. */}
          <span className="ml-0.5 flex items-center gap-1.5 sm:gap-2 md:hidden">
            <Plain icon="users" label="People" onClick={onPeople} active={sidebar === "people"} badge={isTeacher ? hands : 0} badgeTone="bg-amber-500" />
            <Plain icon="message-circle" label="Chat" onClick={onChat} active={sidebar === "chat"} badge={chatUnread} />
          </span>
        </div>

        {/* Right: panels */}
        <div className="hidden items-center justify-end gap-2 md:flex">
          <Plain
            icon="users"
            label={`People (${peopleCount})`}
            onClick={onPeople}
            active={sidebar === "people"}
            badge={isTeacher ? hands : 0}
            badgeTone="bg-amber-500"
            tip={isTeacher && hands ? `${hands} hand${hands === 1 ? "" : "s"} raised` : `People (${peopleCount})`}
          />
          <Plain icon="message-circle" label="Chat" onClick={onChat} active={sidebar === "chat"} badge={chatUnread} />
        </div>
      </div>
    </footer>
  );
}
