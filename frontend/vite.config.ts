import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
const sseMockUrl = process.env.MOCK_SSE_URL;
const apiUrl = process.env.API_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    target: "es2022",
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/panzoom/")) return "panzoom";
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router") ||
              id.includes("/scheduler/")
            ) {
              return "react";
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      ...(sseMockUrl ? { "/api/berths/stream": sseMockUrl } : {}),
      "/api": apiUrl,
    },
  },
});
