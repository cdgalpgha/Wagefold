import type { Config } from "tailwindcss";

// Every color is a CSS variable (see globals.css) so light and dark themes swap in one place.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: { DEFAULT: v("surface"), 2: v("surface-2") },
        night: v("night"),
        ink: { DEFAULT: v("ink"), 2: v("ink-2"), 3: v("ink-3") },
        line: { DEFAULT: v("line"), soft: v("line-soft"), strong: v("line-strong") },
        brand: {
          DEFAULT: v("brand"),
          solid: v("brand-solid"),
          hover: v("brand-hover"),
          dark: v("brand-dark"),
          deep: v("brand-deep"),
          soft: v("brand-soft"),
          muted: v("brand-muted"),
          "muted-ink": v("brand-muted-ink"),
        },
        good: { DEFAULT: v("good"), soft: v("good-soft"), dot: v("good-dot") },
        bad: { DEFAULT: v("bad"), text: v("bad-text"), soft: v("bad-soft"), line: v("bad-line") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft"), line: v("warn-line"), dot: v("warn-dot") },
        logo: { a: v("logo-a"), b: v("logo-b") },
        tone: { 1: v("tone-1"), 2: v("tone-2"), 3: v("tone-3"), 4: v("tone-4"), 5: v("tone-5"), 6: v("tone-6") },
      },
      boxShadow: {
        card: "var(--shadow-card)",
        raised: "var(--shadow-raised)",
        pop: "var(--shadow-pop)",
        button: "var(--shadow-button)",
      },
      transitionTimingFunction: { out: "cubic-bezier(.2,.7,.2,1)" },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
