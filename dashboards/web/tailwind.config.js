/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface2)",
        line: "var(--border)",
        ink: "var(--text)",
        muted: "var(--muted)",
        gold: "var(--gold)",
        gold2: "var(--gold-hi)",
        pos: "var(--positive)",
        neg: "var(--negative)",
        indigo: "var(--indigo)",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
