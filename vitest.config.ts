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
      // Session integration tests need real libSQL in-memory engine.
      ["tests/session/**", "node"],
      // Player import integration tests need real libSQL + fs/path for schema.
      ["tests/db/**", "node"],
      // E2E tests exercise Node APIs (node:crypto randomUUID, node:child_process
      // execFileSync for the no-legacy guard) that jsdom externalizes.
      ["tests/e2e/**", "node"],
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
