import { describe, expect, test } from "vitest";

import type { Env } from "../src/api/auth";
import worker from "../src/index";
import { CLIPDECK_VERSION } from "../src/version";
import packageJson from "../package.json" with { type: "json" };

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

  test("should expose worker version on /api/version", async () => {
    const response = await worker.fetch(
      new Request("https://clipdeck.example/api/version"),
      makeEnv()
    );

    expect([response.status, await response.json()]).toEqual([
      200,
      { version: CLIPDECK_VERSION }
    ]);
  });

  test("CLIPDECK_VERSION should match clipdeck package.json version", () => {
    expect(CLIPDECK_VERSION).toBe(packageJson.version);
  });
});

function makeEnv(): Env {
  return {
    GITHUB_TOKEN: "github-token"
  };
}
