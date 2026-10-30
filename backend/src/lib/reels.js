// The shape of a reel. An animated reel is data: a template plus a list of
// steps; the website turns each step into one animated frame with a caption.
import { z } from "zod";

const caption = z.string().trim().min(1, "Every step needs a caption").max(160);
// Optional spoken text for the voice-over; without it the caption is read (symbols turned into words).
const say = z.string().trim().max(300).optional();
const cellValue = z.union([z.number(), z.string().max(12)]);

const codeStep = z.object({
  caption,
  say,
  line: z.number().int().min(1).optional(), // 1-based line to highlight
  vars: z.record(z.string().max(40)).optional(), // variable name → value shown
  output: z.string().max(400).optional(), // everything printed so far
});

const arrayStep = z.object({
  caption,
  say,
  array: z.array(cellValue).max(16),
  highlight: z.array(z.number().int().min(0)).optional(), // indexes to highlight
  done: z.array(z.number().int().min(0)).optional(), // indexes finished (green)
  pointers: z.record(z.number().int().min(-1)).optional(), // label → index, e.g. { lo: 0, hi: 5 }
  range: z.tuple([z.number().int(), z.number().int()]).optional(), // inclusive; others are dimmed
  swap: z.tuple([z.number().int(), z.number().int()]).optional(), // these two swapped since the last step
});

const stackStep = z.object({
  caption,
  say,
  items: z.array(z.string().max(24)).max(10), // bottom/front first
  popped: z.string().max(24).optional(), // item that just left
});

const dictStep = z.object({
  caption,
  say,
  entries: z.array(z.tuple([z.string().max(20), z.string().max(24)])).max(10),
  highlight: z.string().max(20).optional(), // key to highlight
});

const slideStep = z.object({
  caption,
  say,
  title: z.string().max(60).optional(),
  body: z.string().max(240).optional(),
  code: z.string().max(400).optional(),
});

// ---- plot: points, lines and curves on x/y axes (regression, clustering, gradient descent…)
const num = z.number().finite();
const xy = z.tuple([num, num]);
const plotStep = z.object({
  caption,
  say,
  points: z.array(z.union([xy, z.tuple([num, num, z.number().int().min(0).max(5)])])).max(80).optional(), // [x, y, colourGroup?]
  highlight: z.array(z.number().int().min(0)).max(80).optional(), // point indexes to ring
  line: z.tuple([num, num]).optional(), // slope m and intercept b of y = m·x + b
  curve: z.union([z.enum(["sigmoid", "parabola", "bell", "relu", "tanh"]), z.array(xy).min(2).max(120)]).optional(),
  marker: xy.optional(), // glowing ball, e.g. where gradient descent is now
  centroids: z.array(z.union([xy, z.tuple([num, num, z.number().int().min(0).max(5)])])).max(8).optional(),
  query: xy.optional(), // a new point to classify (drawn as a star)
  radius: num.positive().optional(), // circle around the query, in x units
  segments: z.array(z.tuple([num, num, num, num])).max(40).optional(), // x1, y1, x2, y2 (residuals, links)
  shade: z.tuple([num, num]).optional(), // shade the x-range between these
  label: z.string().max(40).optional(), // small live readout, e.g. "loss = 2.31"
});

// ---- graph: nodes and arrows (decision trees, neural networks, pipelines)
const graphStep = z.object({
  caption,
  say,
  active: z.array(z.string().max(24)).max(40).optional(), // node ids lit up
  done: z.array(z.string().max(24)).max(40).optional(), // node ids finished (green)
  path: z.array(z.tuple([z.string().max(24), z.string().max(24)])).max(60).optional(), // edges lit up
  flow: z.enum(["forward", "backward"]).optional(), // pulses travel along lit edges
  values: z.record(z.string().max(16)).optional(), // node id → small value shown under it
});
const graphNode = z.object({
  id: z.string().min(1).max(24),
  label: z.string().max(40),
  x: z.number().min(0).max(100), // position in % of the stage
  y: z.number().min(0).max(100),
  shape: z.enum(["box", "circle"]).default("box"),
});

const base = {
  stepMs: z.number().int().min(1200).max(8000).default(2800),
  // Big attention-grabbing line shown (and spoken) for the first seconds.
  hook: z.string().trim().max(70).optional(),
};

export const animationSchema = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("code"),
    ...base,
    language: z.enum(["python", "javascript", "cpp", "java", "go"]).default("python"),
    code: z.string().min(1).max(1200),
    steps: z.array(codeStep).min(2).max(24),
  }),
  z.object({
    template: z.literal("array"),
    ...base,
    bars: z.boolean().default(false), // draw values as bars (sorting)
    steps: z.array(arrayStep).min(2).max(24),
  }),
  z.object({
    template: z.literal("stack"),
    ...base,
    mode: z.enum(["stack", "queue", "calls"]).default("stack"),
    steps: z.array(stackStep).min(2).max(24),
  }),
  z.object({ template: z.literal("dict"), ...base, steps: z.array(dictStep).min(2).max(24) }),
  z.object({ template: z.literal("slides"), ...base, steps: z.array(slideStep).min(2).max(24) }),
  z.object({
    template: z.literal("plot"),
    ...base,
    xRange: z.tuple([num, num]).default([0, 10]),
    yRange: z.tuple([num, num]).default([0, 10]),
    xLabel: z.string().max(24).optional(),
    yLabel: z.string().max(24).optional(),
    steps: z.array(plotStep).min(2).max(24),
  }),
  z
    .object({
      template: z.literal("graph"),
      ...base,
      // Either a neural network by layer sizes (node ids "layer-index", e.g. "0-2"), or nodes + edges.
      layers: z.array(z.number().int().min(1).max(6)).min(2).max(5).optional(),
      nodes: z.array(graphNode).max(24).optional(),
      edges: z.array(z.tuple([z.string(), z.string(), z.string().max(16).optional()])).max(60).optional(),
      steps: z.array(graphStep).min(2).max(24),
    })
    .refine((g) => g.layers || g.nodes?.length, { message: "Give layers or nodes", path: ["nodes"] }),
]);

export const reelSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and - only"),
    description: z.string().max(300).default(""),
    topicId: z.number().int().nullable().default(null),
    practiceSlug: z.string().trim().max(80).nullish().transform((v) => v || null),
    kind: z.enum(["ANIMATION", "VIDEO"]),
    animation: animationSchema.nullish(),
    videoUrl: z.string().trim().max(500).nullish().transform((v) => v || null),
    allowDownload: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (r.kind === "ANIMATION" && !r.animation) ctx.addIssue({ code: "custom", path: ["animation"], message: "Add the animation steps" });
    if (r.kind === "VIDEO" && !r.videoUrl) ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "Upload a video or paste a link" });
  });
