"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#fbbf24", "#f59e0b", "#a78bfa", "#22d3ee", "#f472b6", "#34d399", "#ffffff"];

/**
 * Full-screen confetti on a canvas. Each change of `burst` fires a new burst;
 * `rain` keeps a gentle shower falling. Respects reduced-motion settings.
 */
export default function Confetti({ burst = 0, rain = false }) {
  const ref = useRef(null);
  const parts = useRef([]);
  const rainRef = useRef(rain);
  rainRef.current = rain;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    let raf = 0;
    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);
    const step = () => {
      const { width: w, height: h } = canvas;
      g.clearRect(0, 0, w, h);
      if (rainRef.current && parts.current.length < 220) {
        for (let i = 0; i < 3; i++) parts.current.push(piece(Math.random() * w, -20, 0, 2 + Math.random() * 2));
      }
      parts.current = parts.current.filter((p) => p.y < h + 40 && p.life > 0);
      for (const p of parts.current) {
        p.vy += 0.08 * devicePixelRatio;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        p.life -= 1;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.rot * 2)) + 1);
        g.restore();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    if (!burst || !ref.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const { width: w, height: h } = ref.current;
    for (const x of [w * 0.2, w * 0.5, w * 0.8]) {
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const v = (8 + Math.random() * 12) * devicePixelRatio;
        parts.current.push(piece(x, h * 0.75, Math.cos(a) * v, Math.sin(a) * v));
      }
    }
  }, [burst]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" aria-hidden />;
}

function piece(x, y, vx, vy) {
  return {
    x, y, vx, vy,
    rot: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    size: (6 + Math.random() * 8) * devicePixelRatio,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    life: 600,
  };
}
