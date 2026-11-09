import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// VITE_BASE lets the same build run under /wm-client-analytics/ on GitHub Pages or at / locally.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/wm-client-analytics/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
        },
      },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
