"use client";

// Interactive teaching diagrams for lessons, written in Markdown as
//   ```diagram
//   kmeans {"k": 4}
//   ```
// i.e. a widget name, optionally followed by JSON settings.
import { useEffect, useState } from "react";

const SETS = {
  a: { names: ["gradient-descent", "linear-regression", "sigmoid", "activation-functions", "normal-distribution", "overfitting", "bias-variance", "kfold"], load: () => import("./widgetsA").then((m) => m.WIDGETS_A) },
  b: { names: ["kmeans", "knn", "decision-tree", "neural-network", "confusion-matrix", "svm-margin", "pca", "roc-curve"], load: () => import("./widgetsB").then((m) => m.WIDGETS_B) },
  // System Design
  c: { names: ["latency-numbers", "availability", "estimation", "scaling", "load-balancer", "cache", "consistent-hashing"], load: () => import("./widgetsC").then((m) => m.WIDGETS_C) },
  d: { names: ["sharding", "replication", "cap-theorem", "rate-limiter", "message-queue", "circuit-breaker", "bloom-filter"], load: () => import("./widgetsD").then((m) => m.WIDGETS_D) },
  // FastAPI
  e: { names: ["request-lifecycle", "event-loop", "pydantic-validator", "dependency-graph"], load: () => import("./widgetsE").then((m) => m.WIDGETS_E) },
  f: { names: ["jwt-auth", "http-playground", "cors"], load: () => import("./widgetsF").then((m) => m.WIDGETS_F) },
  // Go & Gin
  g: { names: ["gin-lifecycle", "middleware-chain", "router-tree", "gin-playground", "goroutine-channel", "mutex-race", "context-timeout", "slice-growth"], load: () => import("./widgetsG").then((m) => m.WIDGETS_G) },
  // Docker
  h: { names: ["docker-architecture", "container-lifecycle", "docker-terminal", "image-layers", "multi-stage-build"], load: () => import("./widgetsH").then((m) => m.WIDGETS_H) },
  i: { names: ["port-mapping", "docker-network", "volume-mounts", "compose-startup", "resource-limits"], load: () => import("./widgetsI").then((m) => m.WIDGETS_I) },
};
export const DIAGRAM_NAMES = Object.values(SETS).flatMap((s) => s.names);

export function parseDiagram(text) {
  const src = text.trim();
  const name = src.split(/\s/)[0];
  const rest = src.slice(name.length).trim();
  try {
    return { name, params: rest ? JSON.parse(rest) : {} };
  } catch {
    return { name, params: {}, error: "The settings after the name must be JSON, like {\"k\": 3}" };
  }
}

export default function Diagram({ code }) {
  const { name, params, error } = parseDiagram(code);
  const set = Object.values(SETS).find((s) => s.names.includes(name));
  const [Widget, setWidget] = useState(null);

  useEffect(() => {
    let live = true;
    set?.load().then((w) => live && setWidget(() => w[name]));
    return () => (live = false);
  }, [set, name]);

  if (!set || error)
    return (
      <div className="not-prose my-5 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-300">
        {error || `Unknown diagram "${name}". Available: ${DIAGRAM_NAMES.join(", ")}`}
      </div>
    );
  if (!Widget) return <div className="not-prose my-6 h-72 animate-pulse rounded-xl border border-ink-700 bg-ink-900" />;
  return <Widget params={params} />;
}
