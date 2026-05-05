import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "./junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "json"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/api-types.ts",
        "src/main.tsx",
        "src/svg.ts",
        "src/svgMap.tsx",
        "src/lib/Counter.tsx",
        "src/test/**",
        "src/**/*.d.ts",
        "src/**/*.{test,spec}.{ts,tsx}",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
