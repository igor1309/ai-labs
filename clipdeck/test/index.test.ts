import { describe, expect, test } from "vitest";

import worker from "../src/index";

describe("worker", () => {
  test("should return placeholder response on request", async () => {
    const response = await worker.fetch(new Request("https://clipdeck.example/"));

    expect(await response.text()).toBe("clipdeck");
  });
});
