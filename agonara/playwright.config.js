import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  testDir: "./tests",
  testMatch: /\.playwright\.js$/,
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
  workers: 1,
});
