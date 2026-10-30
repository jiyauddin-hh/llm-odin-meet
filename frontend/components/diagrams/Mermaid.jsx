"use client";

// Flowcharts and diagrams written as text in lessons:  ```mermaid  blocks.
// Mermaid is loaded only on pages that use it.
import { useEffect, useId, useState } from "react";

let ready = null;
let queue = Promise.resolve(); // Mermaid draws one chart at a time
function loadMermaid() {
  ready ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        darkMode: true,
        background: "#11131f",
        primaryColor: "#2e2457",
        primaryBorderColor: "#8b5cf6",
        primaryTextColor: "#f1f5f9",
        secondaryColor: "#123447",
        secondaryBorderColor: "#38bdf8",
        tertiaryColor: "#1f2937",
        tertiaryBorderColor: "#475569",
        lineColor: "#a78bfa",
        textColor: "#e2e8f0",
        mainBkg: "#2e2457",
        nodeBorder: "#8b5cf6",
        clusterBkg: "#191c2c",
        clusterBorder: "#363b56",
        edgeLabelBackground: "#191c2c",
        noteBkgColor: "#3b2f0b",
        noteTextColor: "#fde68a",
        noteBorderColor: "#f59e0b",
        actorBkg: "#2e2457",
        actorBorder: "#8b5cf6",
        actorTextColor: "#f1f5f9",
        signalColor: "#a78bfa",
        signalTextColor: "#e2e8f0",
        pie1: "#8b5cf6", pie2: "#38bdf8", pie3: "#34d399", pie4: "#fbbf24", pie5: "#f472b6", pie6: "#fb7185",
        pie7: "#a3e635", pie8: "#fb923c", pie9: "#2dd4bf", pie10: "#c084fc", pie11: "#60a5fa", pie12: "#facc15",
        pieTitleTextColor: "#f1f5f9", pieLegendTextColor: "#e2e8f0", pieSectionTextColor: "#0a0b14", pieStrokeColor: "#11131f", pieOuterStrokeColor: "#363b56",
        // ER diagrams: attribute rows (the defaults are light and unreadable on dark)
        attributeBackgroundColorOdd: "#191c2c",
        attributeBackgroundColorEven: "#11131f",
        // Mind maps and timelines colour each branch from this scale
        cScale0: "#5b21b6", cScale1: "#0e7490", cScale2: "#047857", cScale3: "#b45309", cScale4: "#be185d", cScale5: "#4338ca",
        cScale6: "#0f766e", cScale7: "#9f1239", cScale8: "#6d28d9", cScale9: "#1d4ed8", cScale10: "#15803d", cScale11: "#a16207",
        ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`cScaleLabel${i}`, "#f8fafc"])),
        // Quadrant charts
        quadrant1Fill: "#1e2a3f", quadrant2Fill: "#231d3a", quadrant3Fill: "#191c2c", quadrant4Fill: "#1b2b2a",
        quadrant1TextFill: "#cbd5e1", quadrant2TextFill: "#cbd5e1", quadrant3TextFill: "#cbd5e1", quadrant4TextFill: "#cbd5e1",
        quadrantPointFill: "#fbbf24", quadrantPointTextFill: "#f1f5f9", quadrantTitleFill: "#f1f5f9",
        quadrantXAxisTextFill: "#94a3b8", quadrantYAxisTextFill: "#94a3b8",
        quadrantInternalBorderStrokeFill: "#363b56", quadrantExternalBorderStrokeFill: "#475569",
        // Bar / line charts
        xyChart: {
          backgroundColor: "#11131f",
          titleColor: "#f1f5f9",
          xAxisLabelColor: "#94a3b8", xAxisTitleColor: "#cbd5e1", xAxisTickColor: "#475569", xAxisLineColor: "#475569",
          yAxisLabelColor: "#94a3b8", yAxisTitleColor: "#cbd5e1", yAxisTickColor: "#475569", yAxisLineColor: "#475569",
          plotColorPalette: "#8b5cf6, #38bdf8, #34d399, #fbbf24, #f472b6, #fb7185",
        },
      },
      flowchart: { curve: "basis", htmlLabels: true, padding: 12 },
      sankey: { linkColor: "source" }, // the default gradient links almost vanish on dark
    });
    return mermaid;
  });
  return ready;
}

export default function Mermaid({ code }) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    loadMermaid()
      // Draw off-screen in a box styled like the real one, so text is measured
      // with the same fonts it's shown in (and React never touches it mid-draw).
      .then((m) => (queue = queue.catch(() => {}).then(() => {
        const scratch = document.createElement("div");
        scratch.className = "mermaid-chart";
        scratch.style.cssText = "position:absolute;left:-10000px;top:0;width:1200px;visibility:hidden";
        document.body.appendChild(scratch);
        return m.render(id, code.trim(), scratch).finally(() => scratch.remove());
      })))
      .then(({ svg }) => live && (setSvg(svg), setError("")))
      .catch((e) => {
        document.getElementById(`d${id}`)?.remove(); // mermaid leaves its error drawing behind
        if (live) setError(e?.message || String(e));
      });
    return () => (live = false);
  }, [code, id]);

  if (error)
    return (
      <div className="not-prose my-5 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-xs">
        <div className="mb-2 font-semibold text-rose-300">This diagram has a mistake: {error.split("\n")[0]}</div>
        <pre className="overflow-x-auto whitespace-pre text-slate-400">{code}</pre>
      </div>
    );
  return (
    <figure className="not-prose my-6 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="mermaid-chart mx-auto flex justify-center leading-normal [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      {!svg && <div className="h-32 animate-pulse rounded-lg bg-ink-800" />}
    </figure>
  );
}
