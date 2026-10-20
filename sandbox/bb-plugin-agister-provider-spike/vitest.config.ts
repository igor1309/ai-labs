import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Each test runs a real `agister` against bash fixtures; one at a time.
    fileParallelism: false,
  },
});
