"use client";

const LEVELS = ["bg-white/[0.05]", "bg-brand-700/60", "bg-brand-600/75", "bg-brand-500", "bg-brand-300"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function level(count) {
  if (!count) return 0;
  if (count < 2) return 1;
  if (count < 4) return 2;
  if (count < 7) return 3;
  return 4;
}

/** GitHub-style grid of the last 52 weeks. `data` maps "YYYY-MM-DD" → count. */
export default function Heatmap({ data }) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 7 * 52 - today.getUTCDay());

  const weeks = [];
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0) weeks.push([]);
    const key = d.toISOString().slice(0, 10);
    weeks[weeks.length - 1].push({ key, count: data[key] || 0, month: d.getUTCMonth(), date: d.getUTCDate() });
  }
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const activeDays = Object.values(data).filter(Boolean).length;
  const best = Math.max(0, ...Object.values(data));

  // Label each month once, at the first week that contains one of its first seven days.
  let lastMonth = weeks[0]?.[0]?.month ?? -1;
  const labels = weeks.map((w) => {
    const first = w.find((d) => d.date <= 7);
    if (!first || first.month === lastMonth) return "";
    lastMonth = first.month;
    return MONTHS[first.month];
  });

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <div className="mb-1 flex gap-[3px] pl-7 text-[10px] text-slate-500">
            {labels.map((l, i) => (
              <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap">
                {l}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="flex w-6 shrink-0 flex-col justify-between gap-[3px] text-[9px] leading-[11px] text-slate-500">
              <span />
              <span>Mon</span>
              <span />
              <span>Wed</span>
              <span />
              <span>Fri</span>
              <span />
            </div>
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.key}
                    title={`${day.count} submission${day.count === 1 ? "" : "s"} on ${day.key}`}
                    className={`h-[11px] w-[11px] rounded-[2px] transition hover:ring-1 hover:ring-white/40 ${LEVELS[level(day.count)]}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-300">{total}</span> submissions in the last year · <span className="font-semibold text-slate-300">{activeDays}</span> active days
          {best > 0 && (
            <>
              {" "}
              · best day <span className="font-semibold text-slate-300">{best}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          Less{" "}
          {LEVELS.map((c) => (
            <span key={c} className={`h-[11px] w-[11px] rounded-[2px] ${c}`} />
          ))}{" "}
          More
        </span>
      </div>
    </div>
  );
}
