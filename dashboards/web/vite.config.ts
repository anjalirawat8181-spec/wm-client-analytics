import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/wm-client-analytics/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 300,
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom"] } } },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
