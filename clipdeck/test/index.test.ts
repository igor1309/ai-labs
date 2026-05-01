import { describe, expect, test } from "vitest";

import type { Env } from "../src/api/auth";
import worker from "../src/index";

describe("worker", () => {
  test("should serve static assets on non API request", async () => {
    const response = await worker.fetch(new Request("https://clipdeck.example/"), {
      ...makeEnv(),
      ASSETS: {
        fetch: async () => new Response("static page")
      } as unknown as Fetcher
    });

    expect(await response.text()).toBe("static page");
  });
});

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "github-token",
    SHARED_SECRET: "shared-secret"
  };
}
