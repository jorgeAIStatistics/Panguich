import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each DB-backed test file boots an in-memory Postgres (PGlite), which takes a moment.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
