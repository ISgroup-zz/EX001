import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    // globalSetup resolves the real URL (TEST_DATABASE_URL, or the local compose Postgres).
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://app:app@127.0.0.1:5432/procurement_test?schema=public",
    },
    // The DB-backed suites share one database, so they must not run concurrently.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
