/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080f",
          900: "#0d0f1a",
          850: "#11141f",
          800: "#161a28",
          750: "#1b2032",
          700: "#232a3d",
          600: "#313a52",
          500: "#4a5572",
        },
        brand: {
          50: "#f3f0ff",
          100: "#e9e3ff",
          200: "#d4c8ff",
          300: "#b9a3ff",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6a2bd6",
          800: "#5522ad",
        },
        accent: {
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139, 92, 246, 0.25), 0 10px 40px -10px rgba(139, 92, 246, 0.45)",
        "glow-sm": "0 8px 24px -8px rgba(139, 92, 246, 0.5)",
        "glow-cyan": "0 0 0 1px rgba(34, 211, 238, 0.25), 0 10px 40px -10px rgba(34, 211, 238, 0.45)",
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 1px 2px 0 rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)",
        "card-hover": "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 2px 4px 0 rgba(0,0,0,0.4), 0 20px 40px -16px rgba(0,0,0,0.7)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
        "brand-gradient": "linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #22d3ee 100%)",
        "hero-glow":
          "radial-gradient(60% 50% at 50% 0%, rgba(139, 92, 246, 0.28) 0%, rgba(139, 92, 246, 0) 70%), radial-gradient(40% 40% at 85% 20%, rgba(34, 211, 238, 0.15) 0%, rgba(34, 211, 238, 0) 70%)",
      },
      backgroundSize: { grid: "32px 32px" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "pulse-ring": { "0%": { transform: "scale(1)", opacity: "0.6" }, "100%": { transform: "scale(2.2)", opacity: "0" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "gradient-x": { "0%, 100%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        shimmer: "shimmer 1.8s linear infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite",
        float: "float 6s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        "gradient-x": "gradient-x 8s ease infinite",
      },
      typography: {
        invert: {
          css: {
            "--tw-prose-invert-body": "#cbd5e1",
            "--tw-prose-invert-headings": "#f8fafc",
            "--tw-prose-invert-links": "#a78bfa",
            "--tw-prose-invert-bold": "#f1f5f9",
            "--tw-prose-invert-code": "#e2e8f0",
            "--tw-prose-invert-pre-bg": "#07080f",
            "--tw-prose-invert-quote-borders": "#8b5cf6",
            "--tw-prose-invert-hr": "#232a3d",
            "--tw-prose-invert-th-borders": "#313a52",
            "--tw-prose-invert-td-borders": "#232a3d",
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
