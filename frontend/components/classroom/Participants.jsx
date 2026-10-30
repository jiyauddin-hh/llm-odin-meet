"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import Icon from "@/components/Icons";

const nameOf = (m) => m.name || m.username;
const FEATURE_LABEL = { mic: "Voice", cam: "Video", screen: "Screen share", chat: "Chat", pen: "Code editor", run: "Run code" };

function Section({ title, count, children, action }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title} <span className="text-slate-600">{count}</span>
        </h3>
        {action}
      </div>
      <ul className="space-y-0.5 px-1.5">{children}</ul>
    </div>
  );
}

/** People list with the raised-hands queue, pen and microphone controls for the teacher. */
export default function Participants({ members, writerId, teacherId, me, isTeacher, media, onGive, onTake, onKick, onMute, onMuteAll }) {
  const [confirmKick, setConfirmKick] = useState(null);
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
  const pen = writerId ?? teacherId;
  const online = members.filter((m) => m.online !== false);
  const teachers = online.filter((m) => m.isTeacher);
  const students = online.filter((m) => !m.isTeacher).sort(byName);
  const hands = students.filter((m) => m.hand);
  const away = members.filter((m) => m.online === false).sort(byName);
  const anyStudentMic = students.some((m) => media.get(m.id)?.mic);

  const row = (m, { compact = false } = {}) => {
    const holds = m.id === pen;
    const isMe = m.id === me;
    const md = media.get(m.id) || {};
    const offline = m.online === false;
    const canManage = isTeacher && !m.isTeacher && !offline;
    const perms = m.perms || {};
    const blocked = ["mic", "cam", "screen", "chat", "pen", "run"].filter((f) => perms[f] === false);
    return (
      <li
        key={`${compact ? "h" : "m"}${m.id}`}
        className={`group flex items-center gap-2.5 rounded-xl px-2 py-2 transition ${holds && !compact ? "bg-emerald-500/[0.08] ring-1 ring-inset ring-emerald-500/20" : "hover:bg-white/[0.03]"} ${offline ? "opacity-50" : ""}`}
      >
        <div className="relative">
          <Avatar user={m} size={32} ring={md.speaking} />
          {!offline && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-ink-900" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm text-slate-100">
            <span className="truncate font-medium">{nameOf(m)}</span>
            {isMe && <span className="shrink-0 text-xs text-slate-500">(you)</span>}
            {m.hand && <Icon name="hand" className="h-3.5 w-3.5 shrink-0 animate-bounce text-amber-300" title="Hand raised" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
            {m.isTeacher ? <span className="font-medium text-brand-300">{m.isBot ? "AI teacher" : "Host"}</span> : <span>{offline ? "Left the room" : "Student"}</span>}
            {holds && (
              <span className="flex items-center gap-1 text-emerald-300">
                <Icon name="edit" className="h-3 w-3" /> {m.isTeacher ? "presenting" : "has the pen"}
              </span>
            )}
            {canManage && blocked.length > 0 && (
              <span className="flex items-center gap-1 text-slate-500" title={`Turned off by the admin: ${blocked.map((f) => FEATURE_LABEL[f]).join(", ")}`}>
                <Icon name="lock" className="h-3 w-3" /> {blocked.length === 1 ? `no ${FEATURE_LABEL[blocked[0]].toLowerCase()}` : `${blocked.length} limits`}
              </span>
            )}
            {md.screen && (
              <span className="flex items-center gap-1 text-sky-300">
                <Icon name="monitor" className="h-3 w-3" /> sharing screen
              </span>
            )}
          </div>
        </div>
        {!offline && (
          <span className="flex shrink-0 items-center gap-1.5">
            <Icon name={md.mic ? "mic" : "mic-off"} className={`h-3.5 w-3.5 ${md.mic ? (md.speaking ? "text-emerald-300" : "text-slate-300") : "text-slate-600"}`} />
            <Icon name={md.cam ? "video" : "video-off"} className={`h-3.5 w-3.5 ${md.cam ? "text-slate-300" : "text-slate-600"}`} />
          </span>
        )}
        {canManage && (
          <div className="flex shrink-0 items-center gap-0.5">
            {confirmKick === m.id ? (
              <>
                <button className="btn-ghost btn-sm !px-2 text-xs" onClick={() => setConfirmKick(null)}>
                  Keep
                </button>
                <button className="btn-danger btn-sm !px-2 text-xs" onClick={() => (onKick(m.id), setConfirmKick(null))}>
                  Remove
                </button>
              </>
            ) : (
              <>
                {holds ? (
                  <button className="btn-soft btn-sm !px-2 text-xs" onClick={onTake} title="Take the pen back">
                    Take back
                  </button>
                ) : (
                  <button
                    className={`btn-sm !px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${m.hand && perms.pen !== false ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => onGive(m.id)}
                    disabled={perms.pen === false}
                    title={perms.pen === false ? "The admin hasn't allowed this student to use the code editor" : "Give this student the pen"}
                  >
                    <Icon name={perms.pen === false ? "lock" : "edit"} className="h-3.5 w-3.5" /> {compact || m.hand ? "Give pen" : ""}
                  </button>
                )}
                {!compact && md.mic && (
                  <button className="btn-icon btn-ghost !h-8 !w-8 text-slate-400 hover:text-amber-300" onClick={() => onMute(m.id)} title="Mute" aria-label={`Mute ${nameOf(m)}`}>
                    <Icon name="volume-x" className="h-3.5 w-3.5" />
                  </button>
                )}
                {!compact && (
                  <button
                    className="btn-icon btn-ghost !h-8 !w-8 text-slate-500 hover:text-rose-300"
                    onClick={() => setConfirmKick(m.id)}
                    title="Remove from class"
                    aria-label={`Remove ${nameOf(m)}`}
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto">
      {isTeacher && hands.length > 0 && (
        <div className="bg-amber-500/[0.05]">
          <Section title="Raised hands" count={hands.length}>
            {hands.map((m) => row(m, { compact: true }))}
          </Section>
        </div>
      )}
      <Section title="Host" count={teachers.length}>
        {teachers.map((m) => row(m))}
      </Section>
      <Section
        title="Students"
        count={students.length}
        action={
          isTeacher &&
          anyStudentMic && (
            <button className="btn-ghost btn-sm !py-0.5 text-xs" onClick={onMuteAll}>
              <Icon name="volume-x" className="h-3.5 w-3.5" /> Mute all
            </button>
          )
        }
      >
        {students.length ? students.map((m) => row(m)) : <li className="px-2 py-3 text-xs text-slate-500">No students yet. Share the class code to invite them.</li>}
      </Section>
      {away.length > 0 && (
        <Section title="Left" count={away.length}>
          {away.map((m) => row(m))}
        </Section>
      )}
    </div>
  );
}
