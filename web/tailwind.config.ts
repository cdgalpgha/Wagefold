import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0E1420", 2: "#4A5363", 3: "#5B6472" },
        line: { DEFAULT: "#E3E6EB", soft: "#EEF0F3", strong: "#C4CAD3" },
        canvas: "#F5F6F8",
        brand: { DEFAULT: "#2647D9", dark: "#1A35B0", deep: "#172C8F", soft: "#EBEFFD" },
        good: { DEFAULT: "#0B6B42", soft: "#E6F4EC", dot: "#12A05C" },
        bad: { DEFAULT: "#B42318", text: "#9F1D14", soft: "#FDECEA" },
        warn: { DEFAULT: "#7A4700", soft: "#FDF3E1" },
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
