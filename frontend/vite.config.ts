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
  server: {
    proxy: {
      ...(sseMockUrl ? { "/api/berths/stream": sseMockUrl } : {}),
      "/api": apiUrl,
    },
  },
});
