import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["tests/playwright/**", "**/node_modules/**", "**/dist/**"],
    environmentMatchGlobs: [
      // Socket integration tests need real Node APIs (async_hooks, http).
      ["tests/socket/**", "node"],
      // These tests read files from disk via node:path; jsdom externalizes
      // Node core modules and breaks their named imports.
      ["src/lib/sql-template-safety.test.ts", "node"],
      ["src/lib/db/services/response-timer-status.test.ts", "node"],
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
