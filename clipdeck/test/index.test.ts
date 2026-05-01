import { describe, expect, test } from "vitest";

import type { Env } from "../src/api/auth";
import worker from "../src/index";

describe("worker", () => {
  test("should return placeholder response on request", async () => {
    const response = await worker.fetch(new Request("https://clipdeck.example/"), makeEnv());

    expect(await response.text()).toBe("clipdeck");
  });
});

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "github-token",
    SHARED_SECRET: "shared-secret"
  };
}
