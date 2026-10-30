"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import Icon from "@/components/Icons";

const time = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat({ messages, me, onSend, disabled = false }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Grow with the text, up to about five lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const send = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
              <Icon name="message-circle" className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-white">No messages yet</p>
            <p className="mt-1 text-xs text-slate-500">Messages are visible to everyone in the class.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => {
              const mine = m.by?.id === me;
              const grouped = i > 0 && messages[i - 1].by?.id === m.by?.id && new Date(m.at) - new Date(messages[i - 1].at) < 3 * 60_000;
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "!mt-1" : ""}`}>
                  <div className="w-7 shrink-0">{!grouped && !mine && <Avatar user={m.by} size={28} />}</div>
                  <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
                    {!grouped && (
                      <div className={`mb-1 flex items-baseline gap-2 text-[11px] ${mine ? "flex-row-reverse" : ""}`}>
                        <span className="font-semibold text-slate-200">{mine ? "You" : m.by?.name || m.by?.username}</span>
                        <span className="text-slate-500">{time(m.at)}</span>
                      </div>
                    )}
                    <div
                      className={`whitespace-pre-wrap break-words px-3 py-2 text-sm leading-relaxed ${
                        mine ? "rounded-2xl rounded-tr-md bg-brand-600 text-white" : "rounded-2xl rounded-tl-md bg-white/[0.07] text-slate-100"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {disabled ? (
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-3.5 text-xs text-slate-500">
          <Icon name="lock" className="h-3.5 w-3.5 shrink-0" /> Your admin has turned off chat for you. You can still read messages.
        </div>
      ) : (
      <form onSubmit={send} className="border-t border-white/[0.06] p-2.5">
        <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-ink-950/70 p-1.5 focus-within:border-brand-400/50 focus-within:ring-2 focus-within:ring-brand-500/15">
          <textarea
            ref={box}
            rows={1}
            className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            placeholder="Send a message to everyone"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
            }}
          />
          <button className="btn-primary h-9 w-9 shrink-0 justify-center !p-0" disabled={!text.trim() || busy} aria-label="Send message">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-slate-600">Enter to send · Shift+Enter for a new line</p>
      </form>
      )}
    </div>
  );
}
